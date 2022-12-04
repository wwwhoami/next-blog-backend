export const selectPostWithAuthorCategories = {
  id: true,
  createdAt: true,
  updatedAt: true,
  title: true,
  slug: true,
  excerpt: true,
  viewCount: true,
  coverImage: true,
  author: {
    select: {
      name: true,
      image: true,
    },
  },
  categories: {
    select: {
      category: {
        select: {
          name: true,
          hexColor: true,
        },
      },
    },
  },
};
