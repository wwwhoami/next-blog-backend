import { Category } from '@prisma/client';

export class CategoryNoDescription implements Omit<Category, 'description'> {
  name: string;
  hexColor: string | null;
}

export class CategoryWithHotness implements Category {
  name: string;
  description: string;
  hexColor: string | null;
  hotness: number;
}
