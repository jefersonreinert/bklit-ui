"use client";

import { cva, type VariantProps } from "class-variance-authority";
import {
  type MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useRef,
} from "react";

import { cn } from "@/lib/utils";

/**
 * macOS-style dock: icons grow as the pointer gets near them. Based on the
 * Magic UI dock (framer-motion is the `motion` package here). Children that
 * are <DockIcon> receive the pointer position, the magnification and the
 * distance; anything else (separators, buttons) renders as is.
 */

export interface DockProps extends VariantProps<typeof dockVariants> {
  className?: string;
  /** Size an icon reaches right under the pointer (px). */
  magnification?: number;
  /** How far from the pointer icons start to grow (px). */
  distance?: number;
  direction?: "top" | "middle" | "bottom";
  children: ReactNode;
}

const DEFAULT_SIZE = 40;
const DEFAULT_MAGNIFICATION = 60;
const DEFAULT_DISTANCE = 140;

const dockVariants = cva(
  "mx-auto mt-8 flex h-[58px] w-max gap-2 rounded-2xl border p-2 backdrop-blur-md supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10"
);

const Dock = forwardRef<HTMLDivElement, DockProps>(
  (
    {
      className,
      children,
      magnification = DEFAULT_MAGNIFICATION,
      distance = DEFAULT_DISTANCE,
      direction = "bottom",
      ...props
    },
    ref
  ) => {
    const mouseX = useMotionValue(Number.POSITIVE_INFINITY);

    const renderChildren = () =>
      Children.map(children, (child) => {
        if (isValidElement(child) && child.type === DockIcon) {
          return cloneElement(child as ReactElement<DockIconProps>, {
            mouseX,
            magnification,
            distance,
          });
        }
        return child;
      });

    return (
      <motion.div
        // Viewport x, like getBoundingClientRect (pageX breaks when scrolled)
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        ref={ref}
        {...props}
        className={cn(dockVariants({ className }), {
          "items-start": direction === "top",
          "items-center": direction === "middle",
          "items-end": direction === "bottom",
        })}
      >
        {renderChildren()}
      </motion.div>
    );
  }
);

Dock.displayName = "Dock";

export interface DockIconProps {
  /** Resting size (px). */
  size?: number;
  magnification?: number;
  distance?: number;
  mouseX?: MotionValue<number>;
  className?: string;
  children?: ReactNode;
}

const DockIcon = ({
  size = DEFAULT_SIZE,
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  mouseX,
  className,
  children,
  ...props
}: DockIconProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const fallbackX = useMotionValue(Number.POSITIVE_INFINITY);

  const distanceCalc = useTransform(mouseX ?? fallbackX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthSync = useTransform(
    distanceCalc,
    [-distance, 0, distance],
    [size, magnification, size]
  );

  const width = useSpring(widthSync, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  return (
    <motion.div
      className={cn(
        "flex aspect-square cursor-pointer items-center justify-center rounded-full",
        className
      )}
      ref={ref}
      style={{ width }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

DockIcon.displayName = "DockIcon";

export { Dock, DockIcon, dockVariants };
