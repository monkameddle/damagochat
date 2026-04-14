import { NotFoundError } from '../../shared/errors.js';
import { SearchService } from '../search/service.js';
import type { UserRepository } from './repository.js';
import type { UpdateMeInput, UserProfile } from './schema.js';

export class UserService {
  private readonly search = new SearchService();

  constructor(private readonly repo: UserRepository) {}

  async getMe(userId: string): Promise<UserProfile> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError('User', userId);
    return user;
  }

  async updateMe(userId: string, data: UpdateMeInput): Promise<UserProfile> {
    const user = await this.repo.updateMe(userId, data);
    this.search
      .indexUser({
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        avatarKey: user.avatarKey,
      })
      .catch(() => {
        // Search index sync failure is non-fatal
      });
    return user;
  }

  async searchUsers(query: string): Promise<UserProfile[]> {
    const result = await this.search.searchUsers({ q: query, limit: 20, offset: 0 });
    const ids = result.hits.map((h) => h.id);
    if (ids.length === 0) return [];
    return this.repo.findManyByIds(ids);
  }
}
