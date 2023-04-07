export const selectPostWithAuthorCategories = {
  id: true,
  createdAt: true,
  updatedAt: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  likesCount: true,
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
