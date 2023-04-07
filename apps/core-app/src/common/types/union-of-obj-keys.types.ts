export type UnionOfObjKeys<T extends object> = {
  [k in keyof T]: k;
}[keyof T];
