/**
 * Step enter/exit for hire-onboarding. Spatial consistency (same path forward/back),
 * critically damped spring: no bounce on form screens.
 * `custom` is +1 forward / −1 back.
 */

export const onboardingStepVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 32 : -32,
    filter: "blur(4px)",
  }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -24 : 24,
    filter: "blur(4px)",
  }),
};

/** 0.36s ≈ --duration-soft: multi-step flow can settle a hair longer than snappy UI. */
export const onboardingStepSpring = { type: "spring" as const, bounce: 0, duration: 0.36 };
