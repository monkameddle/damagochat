import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding development data...');

  const alice = await prisma.user.upsert({
    where: { phoneNumber: '+1234567890' },
    update: {},
    create: {
      phoneNumber: '+1234567890',
      displayName: 'Alice',
      about: 'Hey there! I am using Damagochat.',
    },
  });

  const bob = await prisma.user.upsert({
    where: { phoneNumber: '+0987654321' },
    update: {},
    create: {
      phoneNumber: '+0987654321',
      displayName: 'Bob',
      about: 'Available',
    },
  });

  // Alice ↔ Bob contact
  await prisma.contact.upsert({
    where: { userId_contactUserId: { userId: alice.id, contactUserId: bob.id } },
    update: {},
    create: { userId: alice.id, contactUserId: bob.id },
  });

  // Direct chat
  const chat = await prisma.chat.create({
    data: {
      type: 'DIRECT',
      members: {
        create: [
          { userId: alice.id, role: 'MEMBER' },
          { userId: bob.id, role: 'MEMBER' },
        ],
      },
    },
  });

  console.log(`Seeded users: alice=${alice.id}, bob=${bob.id}`);
  console.log(`Seeded chat: ${chat.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
