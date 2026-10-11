/**
 * Free-form menu designs (Canva-like): pages with absolutely positioned
 * texts, images, shapes and icons. Coordinates are page pixels (96 dpi).
 */

export type ElementType = "text" | "image" | "shape" | "icon";
export type TextAlign = "left" | "center" | "right";
export type ShapeKind = "rect" | "ellipse" | "line";

interface Base {
  id: string;
  type: ElementType;
  /** Layer name shown in the layers panel. */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** 0-1 */
  opacity: number;
  locked: boolean;
  hidden: boolean;
}

export interface TextElement extends Base {
  type: "text";
  text: string;
  fontFamily: string;
  /** px */
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  /** Multiplier of the font size. */
  lineHeight: number;
  /** px */
  letterSpacing: number;
  uppercase: boolean;
  /** "" = transparent */
  background: string;
}

export interface ImageElement extends Base {
  type: "image";
  /** URL (Convex storage) or data URL. */
  src: string;
  fit: "cover" | "contain";
  radius: number;
  flipX: boolean;
  borderColor: string;
  borderWidth: number;
}

export interface ShapeElement extends Base {
  type: "shape";
  shape: ShapeKind;
  /** "" = no fill */
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  dashed: boolean;
}

export interface IconElement extends Base {
  type: "icon";
  /** Name in lib/icons (e.g. IconPizza). */
  icon: string;
  color: string;
  strokeWidth: number;
}

export type DesignElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | IconElement;

export interface DesignPage {
  id: string;
  background: string;
  /** Optional full-page background image. */
  backgroundImage: string;
  elements: DesignElement[];
}

export interface Design {
  id: string;
  name: string;
  /** Page size in px. */
  width: number;
  height: number;
  pages: DesignPage[];
  updatedAt: number;
}

export interface DesignData {
  designs: Design[];
}

/**
 * One element as the AI reads or writes it: a flat record (structured
 * outputs need every field), interpreted by `type`.
 */
export interface AiElement {
  id: string;
  type: "text" | "shape" | "image" | "icon" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text: string;
  fontFamily: string;
  fontCategory: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  color: string;
  align: string;
  letterSpacing: number;
  lineHeight: number;
  uppercase: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  shape: string;
  icon: string;
  opacity: number;
}

/** What the AI returns after reading a photographed menu. */
export interface ExtractedDesign {
  name: string;
  /** width / height of the page as photographed. */
  aspect: number;
  pages: {
    pageIndex: number;
    background: string;
    /** Coordinates and font sizes as fractions of the page size. */
    elements: AiElement[];
  }[];
}

/** What the AI returns for an edit instruction (pixels). */
export interface AiEdit {
  message: string;
  background: string;
  elements: AiElement[];
}
