/**
 * @file src/utils/screen-size.ts
 * @description Screen size breakpoints and detection utilities.
 */

export enum ScreenSize {
  XS = "xs",
  SM = "sm",
  MD = "md",
  LG = "lg",
  XL = "xl",
  XXL = "2xl",
}

export const BREAKPOINTS: Record<ScreenSize, number> = {
  [ScreenSize.XS]: 0,
  [ScreenSize.SM]: 640,
  [ScreenSize.MD]: 768,
  [ScreenSize.LG]: 1024,
  [ScreenSize.XL]: 1280,
  [ScreenSize.XXL]: 1536,
};

export function getScreenSize(width: number): ScreenSize {
  if (width >= BREAKPOINTS[ScreenSize.XXL]) return ScreenSize.XXL;
  if (width >= BREAKPOINTS[ScreenSize.XL]) return ScreenSize.XL;
  if (width >= BREAKPOINTS[ScreenSize.LG]) return ScreenSize.LG;
  if (width >= BREAKPOINTS[ScreenSize.MD]) return ScreenSize.MD;
  if (width >= BREAKPOINTS[ScreenSize.SM]) return ScreenSize.SM;
  return ScreenSize.XS;
}
