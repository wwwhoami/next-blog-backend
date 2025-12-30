import { Role } from '@core/src/user/entities/role.enum';
import { Prisma } from '@prisma/client';

// User seed data
export const userData = [
  {
    id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
    name: 'Alice Johnson',
    email: 'alice@prisma.io',
    password: '$2a$12$lCGhm3HSmjkFJFtViSPpSemPLvSGpak1ljgC5WyGoIh/l5Igfyl/K',
    image: 'https://randomuser.me/api/portraits/women/12.jpg',
  },
  {
    id: 'ab182222-5603-4b01-909b-a68fbb3a2154',
    name: 'John Doe',
    email: 'john@prisma.io',
    password: '$2a$12$lCGhm3HSmjkFJFtViSPpSemPLvSGpak1ljgC5WyGoIh/l5Igfyl/K',
    image: 'https://randomuser.me/api/portraits/men/12.jpg',
  },
  {
    id: 'ab182222-5603-4b01-909b-a68fbb3a2155',
    name: 'Sam Smith',
    email: 'sam@prisma.io',
    password: '$2a$12$lCGhm3HSmjkFJFtViSPpSemPLvSGpak1ljgC5WyGoIh/l5Igfyl/K',
    image: 'https://randomuser.me/api/portraits/men/11.jpg',
  },
  {
    id: 'ab182222-5603-4b01-909b-a68fbb3a2156',
    name: 'Mike Richards',
    email: 'mahmoud@prisma.io',
    password: '$2a$12$lCGhm3HSmjkFJFtViSPpSemPLvSGpak1ljgC5WyGoIh/l5Igfyl/K',
    image: 'https://randomuser.me/api/portraits/men/13.jpg',
  },
  {
    id: 'ab182222-5603-4b01-909b-a68fbb3a2157',
    name: 'Admin',
    email: 'admin@admin.com',
    password: '$2a$12$lCGhm3HSmjkFJFtViSPpSemPLvSGpak1ljgC5WyGoIh/l5Igfyl/K',
    role: Role.Admin,
  },
];

// Category seed data
export const categoryData: Prisma.CategoryCreateInput[] = [
  {
    name: 'Python',
    description: 'Python desc',
    hexColor: '#16a34a',
  },
  {
    name: 'JavaScript',
    description: 'JavaScript desc',
    hexColor: '#ca8a04',
  },
  {
    name: 'CSS',
    description: 'CSS desc',
    hexColor: '#2563eb',
  },
  {
    name: 'Ruby',
    description: 'Ruby desc',
    hexColor: '#dc2626',
  },
  {
    name: 'PHP',
    description: 'PHP desc',
    hexColor: '#9333ea',
  },
];

// Comment seed data
export const commentData: Prisma.CommentCreateInput[] = [
  {
    content: 'This is a comment 1',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      connect: {
        id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
      },
    },
    post: {
      connect: {
        id: 1,
      },
    },
    descendants: {
      create: [
        {
          content: 'This is a comment 6 child of 1',
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: {
            connect: {
              id: 'ab182222-5603-4b01-909b-a68fbb3a2155',
            },
          },
          post: {
            connect: {
              id: 1,
            },
          },
        },
        {
          content: 'This is a comment 7 child of 1',
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: {
            connect: {
              id: 'ab182222-5603-4b01-909b-a68fbb3a2154',
            },
          },
          post: {
            connect: {
              id: 1,
            },
          },
          descendants: {
            create: [
              {
                content: 'This is a comment 9 child of 7',
                isDeleted: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                author: {
                  connect: {
                    id: 'ab182222-5603-4b01-909b-a68fbb3a2156',
                  },
                },
                post: {
                  connect: {
                    id: 1,
                  },
                },
              },
              {
                content: 'This is a comment 10 child of 7',
                isDeleted: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                author: {
                  connect: {
                    id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
                  },
                },
                post: {
                  connect: {
                    id: 1,
                  },
                },
                descendants: {
                  create: [
                    {
                      content: 'This is a comment 13 child of 10',
                      isDeleted: false,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      author: {
                        connect: {
                          id: 'ab182222-5603-4b01-909b-a68fbb3a2155',
                        },
                      },
                      post: {
                        connect: {
                          id: 1,
                        },
                      },
                      descendants: {
                        create: [
                          {
                            content: 'This is a comment 15 child of 13',
                            isDeleted: false,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            author: {
                              connect: {
                                id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
                              },
                            },
                            post: {
                              connect: {
                                id: 1,
                              },
                            },
                            descendants: {
                              create: [
                                {
                                  content: 'This is a comment 16 child of 15',
                                  isDeleted: false,
                                  createdAt: new Date(),
                                  updatedAt: new Date(),
                                  author: {
                                    connect: {
                                      id: 'ab182222-5603-4b01-909b-a68fbb3a2155',
                                    },
                                  },
                                  post: {
                                    connect: {
                                      id: 1,
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      content: 'This is a comment 14 child of 10',
                      isDeleted: false,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      author: {
                        connect: {
                          id: 'ab182222-5603-4b01-909b-a68fbb3a2154',
                        },
                      },
                      post: {
                        connect: {
                          id: 1,
                        },
                      },
                    },
                  ],
                },
              },
              {
                content: 'This is a comment 11 child of 7',
                isDeleted: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                author: {
                  connect: {
                    id: 'ab182222-5603-4b01-909b-a68fbb3a2155',
                  },
                },
                post: {
                  connect: {
                    id: 1,
                  },
                },
              },
              {
                content: 'This is a comment 12 child of 7',
                isDeleted: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                author: {
                  connect: {
                    id: 'ab182222-5603-4b01-909b-a68fbb3a2154',
                  },
                },
                post: {
                  connect: {
                    id: 1,
                  },
                },
              },
            ],
          },
        },
        {
          content: 'This is a comment 8 child of 1',
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: {
            connect: {
              id: 'ab182222-5603-4b01-909b-a68fbb3a2156',
            },
          },
          post: {
            connect: {
              id: 1,
            },
          },
        },
      ],
    },
  },
  {
    content: 'This is a comment 2',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      connect: {
        id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
      },
    },
    post: {
      connect: {
        id: 1,
      },
    },
  },
  {
    content: 'This is a comment 3',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      connect: {
        id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
      },
    },
    post: {
      connect: {
        id: 1,
      },
    },
  },
  {
    content: 'This is a comment 4',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      connect: {
        id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
      },
    },
    post: {
      connect: {
        id: 1,
      },
    },
  },
  {
    content: 'This is a comment 5',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      connect: {
        id: 'ab182222-5603-4b01-909b-a68fbb3a2154',
      },
    },
    post: {
      connect: {
        id: 1,
      },
    },
  },
  {
    content: 'COMMENT IS DELETED',
    isDeleted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      connect: {
        id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
      },
    },
    post: {
      connect: {
        id: 1,
      },
    },
  },
];
