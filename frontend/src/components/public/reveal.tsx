'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce)
    return (
      <div className={className} style={{ minWidth: 0 }}>
        {children}
      </div>
    );
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ minWidth: 0 }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce)
    return (
      <div className={className} style={{ minWidth: 0 }}>
        {children}
      </div>
    );
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-64px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      style={{ minWidth: 0 }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce)
    return (
      <div className={className} style={{ minWidth: 0 }}>
        {children}
      </div>
    );
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      style={{ minWidth: 0 }}
    >
      {children}
    </motion.div>
  );
}
