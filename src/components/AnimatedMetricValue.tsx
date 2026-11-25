import React, { useEffect, useState } from 'react';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from 'motion/react';

export interface AnimatedMetricValueProps {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

export const AnimatedMetricValue: React.FC<AnimatedMetricValueProps> = ({
  value,
  decimals = 3,
  suffix = '',
  className = '',
}) => {
  const prefersReduced = useReducedMotion();
  const motionVal = useMotionValue(value);
  const springVal = useSpring(motionVal, {
    stiffness: 160,
    damping: 26,
    mass: 0.65,
  });

  const [displayText, setDisplayText] = useState<string>(value.toFixed(decimals));

  useEffect(() => {
    if (prefersReduced) {
      setDisplayText(value.toFixed(decimals));
    } else {
      motionVal.set(value);
    }
  }, [value, decimals, prefersReduced, motionVal]);

  useMotionValueEvent(springVal, 'change', (latest) => {
    if (!prefersReduced) {
      setDisplayText(latest.toFixed(decimals));
    }
  });

  return (
    <motion.span
      className={`inline-block tabular-nums ${className}`}
      initial={false}
      animate={prefersReduced ? undefined : { opacity: [0.92, 1] }}
      transition={{ duration: 0.18 }}
    >
      {displayText}
      {suffix}
    </motion.span>
  );
};
