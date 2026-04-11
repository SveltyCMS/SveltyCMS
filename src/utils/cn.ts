/**
 * @file src/utils/cn.ts
 * @description Tailwind CSS class merging utility
 *
 * Combines conditional class names and resolves Tailwind CSS conflicts
 * using tailwind-merge.
 */

import { twMerge } from "tailwind-merge";

type ClassValue = ClassArray | ClassDictionary | string | number | null | boolean | undefined;
type ClassDictionary = Record<string, any>;
type ClassArray = ClassValue[];

function clsx(...args: ClassValue[]): string {
  let i = 0,
    tmp,
    x,
    str = "";
  while (i < args.length) {
    if ((tmp = args[i++])) {
      if (typeof tmp === "string") {
        str += (str && " ") + tmp;
      } else if (typeof tmp === "number") {
        str += (str && " ") + tmp;
      } else if (typeof tmp === "object") {
        if (Array.isArray(tmp)) {
          if ((x = clsx(...tmp))) {
            str += (str && " ") + x;
          }
        } else {
          for (x in tmp) {
            if (tmp[x]) {
              str += (str && " ") + x;
            }
          }
        }
      }
    }
  }
  return str;
}

/**
 * Intelligently merges Tailwind classes
 *
 * @param inputs - Array of class values (strings, objects, arrays)
 * @returns A merged string of Tailwind classes without conflicts
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
