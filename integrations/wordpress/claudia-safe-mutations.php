<?php
/**
 * Plugin Name: Claudia Safe Mutations
 * Description: A narrow, transactional WordPress mutation surface for Claudia.
 * Version: 1.0.0
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: SEO_AI
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

namespace Claudia\SafeMutations;

defined( 'ABSPATH' ) || exit;

const PLUGIN_VERSION = '1.0.0';
const PROTOCOL_VERSION = 'claudia-wordpress-mutation-v1';
const DB_VERSION = '1';
const RECEIPT_RETENTION_DAYS = 30;
const MAX_RECEIPTS = 10000;
const CLEANUP_HOOK = 'claudia_safe_mutations_cleanup_receipts';

/**
 * Internal exception whose public message and status are deliberately bounded.
 */
final class Mutation_Exception extends \RuntimeException {
	/** @var string */
	public $error_code;

	/** @var int */
	public $http_status;

	public function __construct( $error_code, $message, $http_status ) {
		parent::__construct( $message );
		$this->error_code = (string) $error_code;
		$this->http_status = (int) $http_status;
	}
}

/**
 * Throw a sanitized error. Caller-controlled values must never be passed here.
 *
 * @throws Mutation_Exception Always.
 */
function fail( $code, $message, $status ) {
	throw new Mutation_Exception( $code, $message, $status );
}

function receipt_table_name() {
	global $wpdb;
	return $wpdb->prefix . 'claudia_mutation_receipts';
}

/**
 * Quote a trusted WordPress table identifier and fail closed on unusual config.
 */
function quote_identifier( $identifier ) {
	if ( ! is_string( $identifier ) || ! preg_match( '/\A[A-Za-z0-9_]+\z/D', $identifier ) ) {
		fail( 'claudia_storage_unavailable', 'Mutation storage is unavailable.', 503 );
	}

	return '`' . $identifier . '`';
}

function install_schema() {
	global $wpdb;

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$table = receipt_table_name();
	$charset_collate = $wpdb->get_charset_collate();
	$sql = "CREATE TABLE {$table} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		idempotency_key varchar(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
		request_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
		post_id bigint(20) unsigned NOT NULL,
		user_id bigint(20) unsigned NOT NULL,
		operation varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
		status varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
		response_json longtext NULL,
		created_at datetime NOT NULL,
		updated_at datetime NOT NULL,
		expires_at datetime NOT NULL,
		PRIMARY KEY  (id),
		UNIQUE KEY idempotency_key (idempotency_key),
		KEY expires_at (expires_at),
		KEY post_created (post_id, created_at)
	) ENGINE=InnoDB {$charset_collate};";

	\dbDelta( $sql );
	if ( 'innodb' !== table_engine( $table ) || ! receipt_schema_is_ready() ) {
		\delete_option( 'claudia_safe_mutations_db_version' );
		return;
	}

	\update_option( 'claudia_safe_mutations_db_version', DB_VERSION, false );

	if ( ! \wp_next_scheduled( CLEANUP_HOOK ) ) {
		\wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', CLEANUP_HOOK );
	}
}

function activate() {
	install_schema();
}

function deactivate() {
	\wp_clear_scheduled_hook( CLEANUP_HOOK );
}

function maybe_upgrade_schema() {
	if ( DB_VERSION !== (string) \get_option( 'claudia_safe_mutations_db_version', '' ) ) {
		install_schema();
	}
}

/**
 * Delete expired receipts in bounded batches. Receipts are deliberately kept
 * on plugin deactivation/uninstall so reinstalling cannot silently permit a
 * duplicate mutation inside the retention window.
 */
function cleanup_receipts() {
	global $wpdb;

	try {
		$table = quote_identifier( receipt_table_name() );
	} catch ( Mutation_Exception $exception ) {
		return;
	}

	for ( $batch = 0; $batch < 10; $batch++ ) {
		$result = $wpdb->query(
			"DELETE FROM {$table} WHERE expires_at < UTC_TIMESTAMP() ORDER BY id ASC LIMIT 1000"
		);

		if ( false === $result || $result < 1000 ) {
			break;
		}
	}
}

\register_activation_hook( __FILE__, __NAMESPACE__ . '\\activate' );
\register_deactivation_hook( __FILE__, __NAMESPACE__ . '\\deactivate' );
\add_action( 'admin_init', __NAMESPACE__ . '\\maybe_upgrade_schema' );
\add_action( CLEANUP_HOOK, __NAMESPACE__ . '\\cleanup_receipts' );

function secure_authenticated_permission() {
	if ( ! \is_ssl() ) {
		return new \WP_Error(
			'claudia_https_required',
			'Claudia mutation endpoints require HTTPS.',
			array( 'status' => 403 )
		);
	}

	if ( ! \is_user_logged_in() ) {
		return new \WP_Error(
			'claudia_authentication_required',
			'Authentication is required.',
			array( 'status' => 401 )
		);
	}

	if ( ! \current_user_can( 'edit_posts' ) ) {
		return new \WP_Error(
			'claudia_forbidden',
			'This account cannot edit posts.',
			array( 'status' => 403 )
		);
	}

	return true;
}

function post_permission( \WP_REST_Request $request ) {
	$authenticated = secure_authenticated_permission();
	if ( true !== $authenticated ) {
		return $authenticated;
	}

	$post_id = absint( $request->get_param( 'id' ) );
	if ( $post_id < 1 || ! \current_user_can( 'edit_post', $post_id ) ) {
		return new \WP_Error(
			'claudia_post_forbidden',
			'This account cannot edit the requested post.',
			array( 'status' => 403 )
		);
	}

	return true;
}

function register_routes() {
	\register_rest_route(
		'claudia/v1',
		'/health',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\health_endpoint',
			'permission_callback' => __NAMESPACE__ . '\\secure_authenticated_permission',
		)
	);

	\register_rest_route(
		'claudia/v1',
		'/capabilities',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\capabilities_endpoint',
			'permission_callback' => __NAMESPACE__ . '\\secure_authenticated_permission',
		)
	);

	\register_rest_route(
		'claudia/v1',
		'/posts/(?P<id>[1-9][0-9]*)/metadata',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\read_metadata_endpoint',
				'permission_callback' => __NAMESPACE__ . '\\post_permission',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\mutate_metadata_endpoint',
				'permission_callback' => __NAMESPACE__ . '\\post_permission',
			),
		)
	);
}

\add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );

function table_engine( $table_name ) {
	global $wpdb;

	if ( ! is_string( $table_name ) || ! preg_match( '/\A[A-Za-z0-9_]+\z/D', $table_name ) ) {
		return null;
	}

	$row = $wpdb->get_row(
		$wpdb->prepare( 'SHOW TABLE STATUS WHERE Name = %s', $table_name )
	);

	if ( ! $row || ! isset( $row->Engine ) || ! is_string( $row->Engine ) ) {
		return null;
	}

	return strtolower( $row->Engine );
}

function receipt_schema_is_ready() {
	global $wpdb;

	$table_name = receipt_table_name();
	if ( ! is_string( $table_name ) || ! preg_match( '/\A[A-Za-z0-9_]+\z/D', $table_name ) ) {
		return false;
	}
	$table = '`' . $table_name . '`';
	$columns = $wpdb->get_col( "SHOW COLUMNS FROM {$table}", 0 );
	if ( ! is_array( $columns ) || ! empty( $wpdb->last_error ) ) {
		return false;
	}

	$required = array(
		'id',
		'idempotency_key',
		'request_hash',
		'post_id',
		'user_id',
		'operation',
		'status',
		'response_json',
		'created_at',
		'updated_at',
		'expires_at',
	);
	if ( array_diff( $required, $columns ) ) {
		return false;
	}

	$indexes = $wpdb->get_results( "SHOW INDEX FROM {$table} WHERE Key_name = 'idempotency_key'" );
	if ( ! is_array( $indexes ) || ! empty( $wpdb->last_error ) ) {
		return false;
	}

	foreach ( $indexes as $index ) {
		if ( isset( $index->Column_name, $index->Non_unique )
			&& 'idempotency_key' === $index->Column_name
			&& 0 === (int) $index->Non_unique ) {
			return true;
		}
	}

	return false;
}

function storage_is_transactional() {
	global $wpdb;

	return DB_VERSION === (string) \get_option( 'claudia_safe_mutations_db_version', '' )
		&& 'innodb' === table_engine( $wpdb->posts )
		&& 'innodb' === table_engine( receipt_table_name() )
		&& receipt_schema_is_ready();
}

function no_store_response( $data, $status = 200 ) {
	$response = new \WP_REST_Response( $data, $status );
	$response->header( 'Cache-Control', 'no-store, private' );
	return $response;
}

function health_endpoint() {
	$ready = storage_is_transactional();
	$response = array(
		'protocol'        => PROTOCOL_VERSION,
		'plugin_version'  => PLUGIN_VERSION,
		'status'          => $ready ? 'ready' : 'unavailable',
		'storage'         => $ready ? 'transactional' : 'unsupported',
		'server_time_gmt' => gmdate( 'Y-m-d\TH:i:s\Z' ),
	);

	return no_store_response( $response, $ready ? 200 : 503 );
}

function capabilities_endpoint() {
	$ready = storage_is_transactional();
	$response = array(
		'protocol'       => PROTOCOL_VERSION,
		'plugin_version' => PLUGIN_VERSION,
		'ready'          => $ready,
		'capabilities'   => array(
			'article.meta.update' => array(
				'path'                       => '/wp-json/claudia/v1/posts/{id}/metadata',
				'post_type'                  => 'post',
				'post_status'                => 'publish',
				'fields'                     => array( 'slug', 'excerpt' ),
				'operations'                 => array( 'apply', 'rollback' ),
				'expected_revision_required' => true,
				'idempotency_required'       => true,
				'remote_read_back'           => true,
				'reversible'                 => true,
				'receipt_retention_days'     => RECEIPT_RETENTION_DAYS,
			)
		),
	);

	return no_store_response( $response, $ready ? 200 : 503 );
}

/**
 * Read a post directly from the database so the revision never depends on a
 * stale object-cache value. Mutation reads use FOR UPDATE inside a transaction.
 */
function read_post_row( $post_id, $for_update = false ) {
	global $wpdb;

	$table = quote_identifier( $wpdb->posts );
	$sql = $wpdb->prepare( "SELECT * FROM {$table} WHERE ID = %d", $post_id );
	if ( $for_update ) {
		$sql .= ' FOR UPDATE';
	}

	$row = $wpdb->get_row( $sql );
	if ( ! empty( $wpdb->last_error ) ) {
		fail( 'claudia_storage_unavailable', 'WordPress storage is unavailable.', 503 );
	}

	if ( ! $row ) {
		fail( 'claudia_post_not_found', 'The requested post was not found.', 404 );
	}

	return $row;
}

function require_eligible_post( $row ) {
	if ( ! isset( $row->post_type, $row->post_status )
		|| 'post' !== $row->post_type
		|| 'publish' !== $row->post_status ) {
		fail(
			'claudia_post_not_eligible',
			'Only published standard posts can be mutated.',
			409
		);
	}
}

/**
 * Hash the complete semantic wp_posts row, not just mutable fields. WordPress's
 * server-maintained modification clocks are excluded so an exact rollback can
 * reproduce the original revision. All unrelated content/authority fields
 * remain covered, so human or plugin drift still invalidates the revision.
 */
function post_revision( $row ) {
	$values = array();
	foreach ( get_object_vars( $row ) as $key => $value ) {
		if ( 'post_modified' === $key || 'post_modified_gmt' === $key ) {
			continue;
		}
		if ( null === $value || is_scalar( $value ) ) {
			$values[ (string) $key ] = null === $value ? null : (string) $value;
		}
	}
	ksort( $values, SORT_STRING );

	$encoded = \wp_json_encode(
		array(
			'protocol' => PROTOCOL_VERSION,
			'post'     => $values,
		),
		JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
	);
	if ( false === $encoded ) {
		fail( 'claudia_state_unavailable', 'The post state could not be encoded.', 503 );
	}

	return hash( 'sha256', $encoded );
}

/**
 * The metadata state contract is intentionally exact: adding fields requires
 * a protocol version change and recertification by Claudia.
 */
function build_state( $row ) {
	require_eligible_post( $row );

	$post_id = (int) $row->ID;
	// Keep the permalink tied to the same row snapshot as slug and revision.
	$link = \get_permalink( new \WP_Post( $row ) );
	$parts = is_string( $link ) ? \wp_parse_url( $link ) : false;
	if ( ! is_string( $link ) || false === $parts || empty( $parts['host'] )
		|| empty( $parts['scheme'] ) || ! in_array( strtolower( $parts['scheme'] ), array( 'http', 'https' ), true ) ) {
		fail( 'claudia_state_unavailable', 'The post permalink is unavailable.', 503 );
	}

	$modified_gmt = \mysql_to_rfc3339( (string) $row->post_modified_gmt );
	if ( ! is_string( $modified_gmt ) || ! preg_match( '/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\z/D', $modified_gmt ) ) {
		fail( 'claudia_state_unavailable', 'The post revision timestamp is unavailable.', 503 );
	}

	return array(
		'protocol'       => PROTOCOL_VERSION,
		'plugin_version' => PLUGIN_VERSION,
		'id'             => $post_id,
		'link'           => $link,
		'modified_gmt'   => $modified_gmt,
		'revision'       => post_revision( $row ),
		'slug'           => (string) $row->post_name,
		'excerpt'        => (string) $row->post_excerpt,
		'status'         => 'publish',
	);
}

function is_exact_state( $state ) {
	if ( ! is_array( $state ) ) {
		return false;
	}

	$expected_keys = array(
		'protocol',
		'plugin_version',
		'id',
		'link',
		'modified_gmt',
		'revision',
		'slug',
		'excerpt',
		'status',
	);
	if ( array_keys( $state ) !== $expected_keys ) {
		return false;
	}

	$link_parts = isset( $state['link'] ) && is_string( $state['link'] )
		? \wp_parse_url( $state['link'] )
		: false;

	return PROTOCOL_VERSION === $state['protocol']
		&& PLUGIN_VERSION === $state['plugin_version']
		&& is_int( $state['id'] )
		&& $state['id'] > 0
		&& is_string( $state['link'] )
		&& false !== $link_parts
		&& ! empty( $link_parts['host'] )
		&& ! empty( $link_parts['scheme'] )
		&& in_array( strtolower( $link_parts['scheme'] ), array( 'http', 'https' ), true )
		&& is_string( $state['modified_gmt'] )
		&& 1 === preg_match( '/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\z/D', $state['modified_gmt'] )
		&& is_string( $state['revision'] )
		&& 1 === preg_match( '/\A[a-f0-9]{64}\z/D', $state['revision'] )
		&& is_string( $state['slug'] )
		&& is_string( $state['excerpt'] )
		&& 'publish' === $state['status'];
}

function read_metadata_endpoint( \WP_REST_Request $request ) {
	$lock_acquired = false;
	try {
		// Serialize reads with companion writes. A compensation read must not
		// observe the old committed row while a timed-out mutation is still
		// finishing in another request.
		acquire_mutation_lock();
		$lock_acquired = true;
		$row = read_post_row( absint( $request->get_param( 'id' ) ) );
		return no_store_response( build_state( $row ) );
	} catch ( Mutation_Exception $exception ) {
		return new \WP_Error(
			$exception->error_code,
			$exception->getMessage(),
			array( 'status' => $exception->http_status )
		);
	} catch ( \Throwable $exception ) {
		return new \WP_Error(
			'claudia_internal_error',
			'The metadata state could not be read.',
			array( 'status' => 503 )
		);
	} finally {
		if ( $lock_acquired ) {
			release_mutation_lock();
		}
	}
}

function has_exact_keys( $value, $keys ) {
	if ( ! is_array( $value ) ) {
		return false;
	}

	$actual = array_keys( $value );
	$expected = $keys;
	sort( $actual, SORT_STRING );
	sort( $expected, SORT_STRING );
	return $actual === $expected;
}

function valid_utf8( $value ) {
	return is_string( $value ) && 1 === preg_match( '//u', $value ) && false === strpos( $value, "\0" );
}

/**
 * Parse and normalize the versioned mutation request. Unknown keys are
 * rejected so a client cannot believe an unsupported instruction was applied.
 */
function parse_mutation_request( \WP_REST_Request $request ) {
	$body = $request->get_json_params();
	$top_level = array( 'protocol', 'operation', 'expected_revision', 'idempotency_key', 'changes' );
	if ( ! has_exact_keys( $body, $top_level ) ) {
		fail( 'claudia_invalid_request', 'The mutation request does not match the protocol.', 400 );
	}

	if ( PROTOCOL_VERSION !== $body['protocol'] ) {
		fail( 'claudia_protocol_mismatch', 'The mutation protocol is not supported.', 400 );
	}

	if ( ! in_array( $body['operation'], array( 'apply', 'rollback' ), true ) ) {
		fail( 'claudia_invalid_operation', 'The mutation operation is not supported.', 400 );
	}

	if ( ! is_string( $body['expected_revision'] )
		|| 1 !== preg_match( '/\A[a-f0-9]{64}\z/D', $body['expected_revision'] ) ) {
		fail( 'claudia_invalid_revision', 'A valid expected revision is required.', 400 );
	}

	if ( ! is_string( $body['idempotency_key'] )
		|| 1 !== preg_match( '/\A[A-Za-z0-9._:-]{16,191}\z/D', $body['idempotency_key'] ) ) {
		fail( 'claudia_invalid_idempotency_key', 'A valid idempotency key is required.', 400 );
	}

	if ( ! is_array( $body['changes'] )
		|| count( $body['changes'] ) < 1
		|| count( $body['changes'] ) > 2
		|| array_diff( array_keys( $body['changes'] ), array( 'slug', 'excerpt' ) ) ) {
		fail( 'claudia_invalid_changes', 'Only slug and excerpt changes are supported.', 400 );
	}

	$changes = array();
	foreach ( array( 'slug', 'excerpt' ) as $field ) {
		if ( ! array_key_exists( $field, $body['changes'] ) ) {
			continue;
		}

		$change = $body['changes'][ $field ];
		if ( ! has_exact_keys( $change, array( 'before', 'after' ) )
			|| ! valid_utf8( $change['before'] )
			|| ! valid_utf8( $change['after'] ) ) {
			fail( 'claudia_invalid_changes', 'The metadata diff is invalid.', 400 );
		}

		if ( $change['before'] === $change['after'] ) {
			fail( 'claudia_invalid_changes', 'The metadata diff contains no change.', 400 );
		}

		if ( 'slug' === $field ) {
			if ( '' === $change['after']
				|| strlen( $change['before'] ) > 200
				|| strlen( $change['after'] ) > 200
				|| \sanitize_title( $change['after'] ) !== $change['after'] ) {
				fail( 'claudia_invalid_slug', 'The requested slug is not canonical.', 400 );
			}
		} elseif ( strlen( $change['before'] ) > 60000 || strlen( $change['after'] ) > 60000 ) {
			fail( 'claudia_invalid_excerpt', 'The requested excerpt is too large.', 400 );
		}

		$changes[ $field ] = array(
			'before' => $change['before'],
			'after'  => $change['after'],
		);
	}

	return array(
		'protocol'          => PROTOCOL_VERSION,
		'operation'         => $body['operation'],
		'expected_revision' => $body['expected_revision'],
		'idempotency_key'   => $body['idempotency_key'],
		'changes'           => $changes,
	);
}

function mutation_request_hash( $post_id, $user_id, $mutation ) {
	$encoded = \wp_json_encode(
		array(
			'protocol'          => $mutation['protocol'],
			'operation'         => $mutation['operation'],
			'expected_revision' => $mutation['expected_revision'],
			'idempotency_key'   => $mutation['idempotency_key'],
			'post_id'           => (int) $post_id,
			'user_id'           => (int) $user_id,
			'changes'           => $mutation['changes'],
		),
		JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
	);
	if ( false === $encoded ) {
		fail( 'claudia_invalid_request', 'The mutation request could not be encoded.', 400 );
	}

	return hash( 'sha256', $encoded );
}

function mutation_lock_name() {
	global $wpdb;
	$database = defined( 'DB_NAME' ) ? (string) DB_NAME : '';
	return 'claudia_mut_' . substr( hash( 'sha256', $database . '|' . $wpdb->prefix ), 0, 32 );
}

function acquire_mutation_lock() {
	global $wpdb;
	$result = $wpdb->get_var(
		$wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', mutation_lock_name() )
	);

	if ( '1' !== (string) $result ) {
		fail( 'claudia_mutation_busy', 'The mutation channel is busy; retry later.', 503 );
	}
}

function release_mutation_lock() {
	global $wpdb;
	$wpdb->get_var(
		$wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', mutation_lock_name() )
	);
}

function begin_transaction() {
	global $wpdb;
	if ( false === $wpdb->query( 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE' ) ) {
		fail( 'claudia_storage_unavailable', 'The required transaction isolation is unavailable.', 503 );
	}
	if ( false === $wpdb->query( 'START TRANSACTION' ) ) {
		fail( 'claudia_storage_unavailable', 'A mutation transaction could not be started.', 503 );
	}
}

function commit_transaction() {
	global $wpdb;
	if ( false === $wpdb->query( 'COMMIT' ) ) {
		fail( 'claudia_storage_unavailable', 'The mutation transaction could not be committed.', 503 );
	}
}

function rollback_transaction() {
	global $wpdb;
	$wpdb->query( 'ROLLBACK' );
}

function completed_receipt_state( $receipt, $request_hash ) {
	if ( ! hash_equals( (string) $receipt->request_hash, $request_hash ) ) {
		fail(
			'claudia_idempotency_conflict',
			'The idempotency key was already used for another request.',
			409
		);
	}

	if ( 'completed' !== $receipt->status ) {
		fail(
			'claudia_idempotency_in_progress',
			'The idempotent mutation has not reached a reusable state.',
			409
		);
	}

	$state = json_decode( (string) $receipt->response_json, true );
	if ( ! is_exact_state( $state ) ) {
		fail( 'claudia_receipt_corrupt', 'The idempotency receipt is invalid.', 503 );
	}

	return $state;
}

/**
 * Lock the requested slug range and apply WordPress's own uniqueness policy.
 * SERIALIZABLE isolation prevents another transactional writer from inserting
 * the same indexed slug between this check and commit.
 */
function require_available_slug( $post_id, $row, $slug ) {
	global $wpdb;

	$table = quote_identifier( $wpdb->posts );
	$conflict = $wpdb->get_var(
		$wpdb->prepare(
			"SELECT ID FROM {$table} WHERE post_name = %s AND ID <> %d LIMIT 1 FOR UPDATE",
			$slug,
			$post_id
		)
	);
	if ( ! empty( $wpdb->last_error ) ) {
		fail( 'claudia_storage_unavailable', 'WordPress storage is unavailable.', 503 );
	}
	if ( null !== $conflict ) {
		fail( 'claudia_slug_conflict', 'The requested slug is already in use.', 409 );
	}

	$canonical = \wp_unique_post_slug(
		$slug,
		$post_id,
		'publish',
		'post',
		(int) $row->post_parent
	);
	if ( ! is_string( $canonical ) || $canonical !== $slug ) {
		fail( 'claudia_slug_conflict', 'The requested slug is not available.', 409 );
	}
}

/**
 * Perform the narrow database update required for compare-and-set semantics.
 * Normal post-save hooks are intentionally not invoked: arbitrary callbacks
 * cannot be made part of the database transaction or safely compensated.
 */
function write_metadata_columns( $post_id, $mutation ) {
	global $wpdb;

	$modified_local = \current_time( 'mysql' );
	$modified_gmt = \current_time( 'mysql', true );
	$values = array(
		'post_modified'     => $modified_local,
		'post_modified_gmt' => $modified_gmt,
	);
	$formats = array( '%s', '%s' );

	if ( isset( $mutation['changes']['slug'] ) ) {
		$values['post_name'] = $mutation['changes']['slug']['after'];
		$formats[] = '%s';
	}
	if ( isset( $mutation['changes']['excerpt'] ) ) {
		$values['post_excerpt'] = $mutation['changes']['excerpt']['after'];
		$formats[] = '%s';
	}

	$updated = $wpdb->update(
		$wpdb->posts,
		$values,
		array( 'ID' => $post_id ),
		$formats,
		array( '%d' )
	);
	if ( false === $updated ) {
		fail( 'claudia_update_rejected', 'WordPress rejected the metadata update.', 503 );
	}
	if ( 1 !== $updated ) {
		fail( 'claudia_value_conflict', 'The post changed before the metadata update.', 409 );
	}

	return array(
		'post_modified'     => $modified_local,
		'post_modified_gmt' => $modified_gmt,
	);
}

/**
 * Verify that no trigger, database behavior, or unexpected code changed any
 * wp_posts column beyond the requested values and WordPress modification time.
 */
function require_exact_row_delta( $before_row, $after_row, $mutation, $timestamps ) {
	$before = get_object_vars( $before_row );
	$after = get_object_vars( $after_row );
	if ( array_keys( $before ) !== array_keys( $after ) ) {
		fail( 'claudia_readback_conflict', 'The post row shape changed unexpectedly.', 409 );
	}

	foreach ( $before as $column => $before_value ) {
		$expected = $before_value;
		if ( 'post_name' === $column && isset( $mutation['changes']['slug'] ) ) {
			$expected = $mutation['changes']['slug']['after'];
		} elseif ( 'post_excerpt' === $column && isset( $mutation['changes']['excerpt'] ) ) {
			$expected = $mutation['changes']['excerpt']['after'];
		} elseif ( 'post_modified' === $column || 'post_modified_gmt' === $column ) {
			$expected = $timestamps[ $column ];
		}

		if ( (string) $after[ $column ] !== (string) $expected ) {
			fail(
				'claudia_readback_conflict',
				'WordPress changed a field outside the approved metadata diff; the transaction was reverted.',
				409
			);
		}
	}
}

/**
 * Execute a compare-and-set metadata mutation and persist its exact response in
 * the same InnoDB transaction. The receipt lookup deliberately precedes the
 * revision check so a lost successful response can always be replayed.
 */
function mutate_metadata_endpoint( \WP_REST_Request $request ) {
	global $wpdb;

	$post_id = absint( $request->get_param( 'id' ) );
	$user_id = \get_current_user_id();
	$transaction_started = false;
	$lock_acquired = false;
	$post_cache_may_be_dirty = false;

	try {
		$mutation = parse_mutation_request( $request );
		$request_hash = mutation_request_hash( $post_id, $user_id, $mutation );

		if ( ! storage_is_transactional() ) {
			fail(
				'claudia_transaction_required',
				'The site does not provide the required transactional storage.',
				503
			);
		}

		acquire_mutation_lock();
		$lock_acquired = true;
		begin_transaction();
		$transaction_started = true;

		$table = quote_identifier( receipt_table_name() );
		$wpdb->query(
			"DELETE FROM {$table} WHERE expires_at < UTC_TIMESTAMP() ORDER BY id ASC LIMIT 1000"
		);

		$receipt = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT id, request_hash, status, response_json FROM {$table} WHERE idempotency_key = %s FOR UPDATE",
				$mutation['idempotency_key']
			)
		);
		if ( ! empty( $wpdb->last_error ) ) {
			fail( 'claudia_storage_unavailable', 'Mutation storage is unavailable.', 503 );
		}

		if ( $receipt ) {
			$state = completed_receipt_state( $receipt, $request_hash );
			commit_transaction();
			$transaction_started = false;
			return no_store_response( $state );
		}

		$receipt_count = $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
		if ( null === $receipt_count || (int) $receipt_count >= MAX_RECEIPTS ) {
			fail(
				'claudia_receipt_capacity',
				'Mutation receipt capacity is unavailable; retry after retention cleanup.',
				503
			);
		}

		$inserted = $wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$table}
				(idempotency_key, request_hash, post_id, user_id, operation, status, response_json, created_at, updated_at, expires_at)
				VALUES (%s, %s, %d, %d, %s, 'pending', NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL %d DAY))",
				$mutation['idempotency_key'],
				$request_hash,
				$post_id,
				$user_id,
				$mutation['operation'],
				RECEIPT_RETENTION_DAYS
			)
		);
		if ( 1 !== $inserted ) {
			fail( 'claudia_idempotency_race', 'The idempotency receipt could not be reserved.', 503 );
		}
		$receipt_id = (int) $wpdb->insert_id;

		$row = read_post_row( $post_id, true );
		require_eligible_post( $row );
		$current_revision = post_revision( $row );
		if ( ! hash_equals( $current_revision, $mutation['expected_revision'] ) ) {
			fail(
				'claudia_revision_conflict',
				'The post changed after it was read; no mutation was applied.',
				409
			);
		}

		$current_values = array(
			'slug'    => (string) $row->post_name,
			'excerpt' => (string) $row->post_excerpt,
		);
		foreach ( $mutation['changes'] as $field => $change ) {
			if ( $current_values[ $field ] !== $change['before'] ) {
				fail(
					'claudia_value_conflict',
					'The post value does not match the proposed before state; no mutation was applied.',
					409
				);
			}
		}

		if ( isset( $mutation['changes']['slug'] ) ) {
			require_available_slug(
				$post_id,
				$row,
				$mutation['changes']['slug']['after']
			);
		}

		$post_cache_may_be_dirty = true;
		$timestamps = write_metadata_columns( $post_id, $mutation );

		$after_row = read_post_row( $post_id, true );
		require_eligible_post( $after_row );
		require_exact_row_delta( $row, $after_row, $mutation, $timestamps );
		$after_values = array(
			'slug'    => (string) $after_row->post_name,
			'excerpt' => (string) $after_row->post_excerpt,
		);
		foreach ( $mutation['changes'] as $field => $change ) {
			if ( $after_values[ $field ] !== $change['after'] ) {
				fail(
					'claudia_readback_conflict',
					'WordPress did not persist the exact requested value; the transaction was reverted.',
					409
				);
			}
		}

		$state = build_state( $after_row );
		$response_json = \wp_json_encode(
			$state,
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);
		if ( false === $response_json ) {
			fail( 'claudia_state_unavailable', 'The mutation response could not be persisted.', 503 );
		}

		$receipt_updated = $wpdb->query(
			$wpdb->prepare(
				"UPDATE {$table}
				SET status = 'completed', response_json = %s, updated_at = UTC_TIMESTAMP()
				WHERE id = %d AND status = 'pending'",
				$response_json,
				$receipt_id
			)
		);
		if ( 1 !== $receipt_updated ) {
			fail( 'claudia_receipt_failed', 'The mutation receipt could not be completed.', 503 );
		}

		commit_transaction();
		$transaction_started = false;
		\clean_post_cache( $post_id );
		$post_cache_may_be_dirty = false;
		return no_store_response( $state );
	} catch ( Mutation_Exception $exception ) {
		if ( $transaction_started ) {
			rollback_transaction();
			$transaction_started = false;
		}
		if ( $post_cache_may_be_dirty && $post_id > 0 ) {
			\clean_post_cache( $post_id );
		}

		return new \WP_Error(
			$exception->error_code,
			$exception->getMessage(),
			array( 'status' => $exception->http_status )
		);
	} catch ( \Throwable $exception ) {
		if ( $transaction_started ) {
			rollback_transaction();
			$transaction_started = false;
		}
		if ( $post_cache_may_be_dirty && $post_id > 0 ) {
			\clean_post_cache( $post_id );
		}

		return new \WP_Error(
			'claudia_internal_error',
			'The metadata mutation could not be completed.',
			array( 'status' => 503 )
		);
	} finally {
		if ( $lock_acquired ) {
			release_mutation_lock();
		}
	}
}
