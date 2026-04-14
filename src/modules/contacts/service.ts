import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import type { UserRepository } from '../users/repository.js';
import type { ContactRepository } from './repository.js';
import type { AddContactInput, ContactEntry } from './schema.js';

export class ContactService {
  constructor(
    private readonly contactRepo: ContactRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async list(userId: string): Promise<ContactEntry[]> {
    return this.contactRepo.list(userId);
  }

  async add(userId: string, input: AddContactInput): Promise<ContactEntry> {
    const target = await this.userRepo.findByPhone(input.phoneNumber);
    if (!target) throw new NotFoundError('User with phone number');

    if (target.id === userId) {
      throw new ValidationError('Cannot add yourself as a contact');
    }

    const existing = await this.contactRepo.find(userId, target.id);
    if (existing) throw new ConflictError('Contact already exists');

    return this.contactRepo.create({
      userId,
      contactUserId: target.id,
      nickname: input.nickname,
    });
  }

  async remove(userId: string, contactUserId: string): Promise<void> {
    const existing = await this.contactRepo.find(userId, contactUserId);
    if (!existing) throw new NotFoundError('Contact', contactUserId);
    await this.contactRepo.delete(userId, contactUserId);
  }
}
