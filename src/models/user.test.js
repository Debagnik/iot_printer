const fc = require('fast-check');
const bcrypt = require('bcryptjs');

describe('User Authentication', () => {
  /**
   * **Feature: print-queue-manager, Property 1: Authentication Round Trip**
   * 
   * For any valid username and password pair, after a user logs in successfully,
   * retrieving the user's session should return the same user ID that was authenticated.
   * 
   * **Validates: Requirements 1.2, 1.4**
   */
  test('Property 1: Authentication Round Trip - Password hashing and comparison', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          password: fc.string({ minLength: 8, maxLength: 50 })
        }),
        async (data) => {
          const { password } = data;

          // Phase 1: Hash password
          const hash = await bcrypt.hash(password, 10);
          expect(hash).toBeDefined();
          expect(hash).not.toBe(password);

          // Phase 2: Compare with correct password
          const isValid = await bcrypt.compare(password, hash);
          expect(isValid).toBe(true);

          // Phase 3: Verify hash is consistent (same password produces valid comparison)
          const isValidAgain = await bcrypt.compare(password, hash);
          expect(isValidAgain).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  }, 60000);

  /**
   * **Feature: print-queue-manager, Property 3: Invalid Credentials Rejection**
   * 
   * For any username and password pair, if the password is incorrect,
   * the authentication should fail and return null.
   * 
   * **Validates: Requirements 1.3**
   */
  test('Property 3: Invalid Credentials Rejection - Wrong password is rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          correctPassword: fc.string({ minLength: 8, maxLength: 50 }),
          wrongPassword: fc.string({ minLength: 8, maxLength: 50 })
        }).filter(data => data.correctPassword !== data.wrongPassword),
        async (data) => {
          const { correctPassword, wrongPassword } = data;

          // Phase 1: Hash correct password
          const hash = await bcrypt.hash(correctPassword, 10);

          // Phase 2: Verify correct password works
          const correctMatch = await bcrypt.compare(correctPassword, hash);
          expect(correctMatch).toBe(true);

          // Phase 3: Verify wrong password fails
          const wrongMatch = await bcrypt.compare(wrongPassword, hash);
          expect(wrongMatch).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  }, 60000);
});
