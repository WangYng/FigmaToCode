import { lowercaseFirstLetter } from "./lowercaseFirstLetter";
import { escapeHTML } from "./escapeHTML";

export const formatStyleAttribute = (styles: string[]): string => {
  const declarations = styles.map((style) => style.trim()).join("; ");
  return declarations === "" ? "" : ` style="${escapeHTML(declarations)}"`;
};

export const formatDataAttribute = (label: string, value?: string) =>
  ` data-${lowercaseFirstLetter(label).replace(/[^a-zA-Z0-9_-]/g, "-")}${value === undefined ? "" : `="${escapeHTML(value)}"`}`;

export const formatClassAttribute = (classes: string[]): string =>
  classes.length === 0 ? "" : ` class="${escapeHTML(classes.join(" "))}"`;
