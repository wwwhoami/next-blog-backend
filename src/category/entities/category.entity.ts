export class CategoryEntity {
  name: string;
  hexColor: string | null;
}

export class CategoryWithHotness {
  name: string;
  description: string;
  hexColor: string | null;
  hotness: number;
}
