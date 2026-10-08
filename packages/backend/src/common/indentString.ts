// From https://github.com/sindresorhus/indent-string
export const indentString = (str: string, indentLevel: number = 2): string => {
  // const options = {
  //   includeEmptyLines: false,
  // };

  // const regex = options.includeEmptyLines ? /^/gm : /^(?!\s*$)/gm;
  const regex = /^(?!\s*$)/gm;
  return str.replace(regex, " ".repeat(indentLevel));
};
