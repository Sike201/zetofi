'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const defaultVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function ScrollReveal({
  children,
  className = '',
  variants = defaultVariants,
  transition = { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  once = true,
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: '-40px 0px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={variants}
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}
