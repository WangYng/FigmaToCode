import { lowercaseFirstLetter } from "./lowercaseFirstLetter";

export const formatStyleAttribute = (styles: string[]): string => {
  const declarations = styles.map((style) => style.trim()).join("; ");
  return declarations === "" ? "" : ` style="${declarations}"`;
};

export const formatDataAttribute = (label: string, value?: string) =>
  ` data-${lowercaseFirstLetter(label).replace(" ", "-")}${value === undefined ? "" : `="${value}"`}`;

export const formatClassAttribute = (classes: string[]): string =>
  classes.length === 0 ? "" : ` class="${classes.join(" ")}"`;
