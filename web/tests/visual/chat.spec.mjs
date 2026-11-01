/**
 * Visual tests for Chat Widget UI
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Widget', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test('Chat widget trigger button is visible', async ({ page }) => {
		const trigger = page.locator('.chat-widget__trigger');
		await expect(trigger).toBeVisible();
		await expect(trigger).toHaveAttribute('aria-label');
	});

	test('Chat panel opens on trigger click', async ({ page }) => {
		const trigger = page.locator('.chat-widget__trigger');
		const panel = page.locator('.chat-panel');

		await trigger.click();
		await expect(panel).not.toBeHidden();
		await expect(panel).toBeVisible();
	});

	test('Chat panel has header with title and close button', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();

		await expect(page.locator('.chat-panel__title')).toBeVisible();
		await expect(page.locator('.chat-panel__close')).toBeVisible();
	});

	test('Chat panel has input area with textarea and send button', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();

		await expect(page.locator('#chat-input')).toBeVisible();
		await expect(page.locator('.chat-panel__send')).toBeVisible();
	});

	test('Chat panel closes on close button click', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();
		await page.locator('.chat-panel__close').click();

		const panel = page.locator('.chat-panel');
		await expect(panel).toBeHidden();
	});

	test('Chat panel closes on Escape key', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();
		await page.keyboard.press('Escape');

		const panel = page.locator('.chat-panel');
		await expect(panel).toBeHidden();
	});

	test('User can send a message and see it in the chat', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();

		await page.fill('#chat-input', 'Hello, this is a test message');
		await page.click('.chat-panel__send');

		await expect(page.locator('.chat-message--user .chat-message__content')).toContainText('Hello, this is a test message');
	});

	test('Chat messages have proper styling for user vs assistant', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();

		await page.fill('#chat-input', 'Test message');
		await page.click('.chat-panel__send');

		const userMsg = page.locator('.chat-message--user').first();
		await expect(userMsg).toBeVisible();
		await expect(userMsg.locator('.chat-message__content')).toHaveCSS('background-color', 'rgb(var(--color-accent))');
	});

	test('Chat panel is accessible - focus management', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();

		// Focus should move to input
		await expect(page.locator('#chat-input')).toBeFocused();
	});

	test('Chat panel has proper ARIA attributes', async ({ page }) => {
		await page.locator('.chat-widget__trigger').click();

		const panel = page.locator('.chat-panel');
		await expect(panel).toHaveAttribute('role', 'dialog');
		await expect(panel).toHaveAttribute('aria-modal', 'true');
		await expect(panel).toHaveAttribute('aria-labelledby');
	});

	test('Mobile layout - panel takes full width', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.locator('.chat-widget__trigger').click();

		const panel = page.locator('.chat-panel');
		await expect(panel).toHaveCSS('left', '0px');
		await expect(panel).toHaveCSS('right', '0px');
	});

	test('Chat widget trigger is accessible - keyboard navigation', async ({ page }) => {
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');

		const trigger = page.locator('.chat-widget__trigger');
		await expect(trigger).toBeFocused();
	});

	test('Reduced motion - panel opens without animation', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.locator('.chat-widget__trigger').click();

		const panel = page.locator('.chat-panel');
		await expect(panel).toHaveCSS('animation', 'none');
	});
});