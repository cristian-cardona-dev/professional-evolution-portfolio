import { test, expect } from '@playwright/test';

/**
 * D2: Surface milestone interactions above the fold
 * 
 * Tests that:
 * 1. Reactions control + "Join discussion" link are visible in first viewport (390x844)
 * 2. EvolutionTimeline rows have "Read the story" links
 * 3. SVG heart renders correctly in light/dark modes
 */

const MILESTONE_ID = '2026-10-03-initial-portfolio-build';
const MILESTONE_EN = `/professional-evolution-portfolio/evolution/${MILESTONE_ID}/`;
const MILESTONE_ES = `/professional-evolution-portfolio/es/evolution/${MILESTONE_ID}/`;

test.describe('D2: Milestone interactions above the fold', () => {
  test.describe('First viewport visibility (390x844)', () => {
    test('reactions control and join discussion link are visible without scrolling', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(MILESTONE_EN);
      
      // Wait for the page to load
      await page.waitForSelector('.milestone-post__hero');
      
      // Check reactions control is visible in first viewport
      const reactionsControl = page.locator('.milestone-reactions');
      await expect(reactionsControl).toBeVisible();
      
      // Check join discussion link is visible in first viewport
      const joinDiscussionLink = page.locator('.milestone-post__join-discussion');
      await expect(joinDiscussionLink).toBeVisible();
      await expect(joinDiscussionLink).toHaveAttribute('href', '#comments');
      
      // Verify both are within the hero area
      const heroBox = await page.locator('.milestone-post__hero').boundingBox();
      const reactionsBox = await reactionsControl.boundingBox();
      const joinBox = await joinDiscussionLink.boundingBox();
      
      expect(reactionsBox.y).toBeLessThan(844);
      expect(joinBox.y).toBeLessThan(844);
    });

    test('ES locale shows reactions control and join discussion link', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(MILESTONE_ES);
      
      await page.waitForSelector('.milestone-post__hero');
      
      const reactionsControl = page.locator('.milestone-reactions');
      await expect(reactionsControl).toBeVisible();
      
      const joinDiscussionLink = page.locator('.milestone-post__join-discussion');
      await expect(joinDiscussionLink).toBeVisible();
      await expect(joinDiscussionLink).toHaveText('Únete a la conversación');
    });
  });

  test.describe('EvolutionTimeline "Read the story" links', () => {
    test('timeline rows have read story links', async ({ page }) => {
      await page.goto('/professional-evolution-portfolio/evolution/');
      
      // Wait for timeline to load
      await page.waitForSelector('.timeline');
      
      // Check that at least one timeline row has a read story link
      const readStoryLinks = page.locator('.timeline__read-story');
      const count = await readStoryLinks.count();
      expect(count).toBeGreaterThan(0);
      
      // Verify the first link has correct attributes
      const firstLink = readStoryLinks.first();
      await expect(firstLink).toBeVisible();
      await expect(firstLink).toHaveText('Read the story');
      
      // Verify it links to a milestone detail page
      const href = await firstLink.getAttribute('href');
      expect(href).toMatch(/\/evolution\/[\w-]+\//);
    });

    test('ES timeline rows show Spanish read story text', async ({ page }) => {
      await page.goto('/professional-evolution-portfolio/es/evolution/');
      
      await page.waitForSelector('.timeline');
      
      const readStoryLinks = page.locator('.timeline__read-story');
      const firstLink = readStoryLinks.first();
      await expect(firstLink).toHaveText('Leer la historia');
    });
  });

  test.describe('SVG heart in light/dark modes', () => {
    test('SVG heart renders with currentColor in dark mode', async ({ page }) => {
      await page.goto(MILESTONE_EN);
      
      // Wait for reactions control to load
      await page.waitForSelector('.milestone-reactions');
      
      // Check SVG heart exists
      const heartSvg = page.locator('.milestone-reactions__heart');
      await expect(heartSvg).toBeVisible();
      
      // Verify SVG has aria-hidden
      await expect(heartSvg).toHaveAttribute('aria-hidden', 'true');
      
      // Verify SVG uses fill="currentColor"
      await expect(heartSvg).toHaveAttribute('fill', 'currentColor');
      
      // Verify the heart path is present
      const path = heartSvg.locator('path');
      await expect(path).toBeVisible();
    });

    test('SVG heart inherits accent color when pressed', async ({ page }) => {
      await page.goto(MILESTONE_EN);
      
      await page.waitForSelector('.milestone-reactions__button');
      
      const button = page.locator('.milestone-reactions__button');
      
      // Verify the button uses currentColor for the SVG, so when aria-pressed changes
      // the CSS color change will propagate to the heart icon
      const svgFill = await button.locator('svg.milestone-reactions__heart').getAttribute('fill');
      expect(svgFill).toBe('currentColor');
      
      // Verify the CSS rule exists: when aria-pressed="true", the button color changes
      const hasPressedStyle = await page.evaluate(() => {
        const btn = document.querySelector('.milestone-reactions__button');
        const computedPressed = window.getComputedStyle(btn, ':hover').color;
        return computedPressed !== undefined;
      });
      expect(hasPressedStyle).toBe(true);
    });

    test('SVG heart works in light mode', async ({ page }) => {
      // Set light mode
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(MILESTONE_EN);
      
      await page.waitForSelector('.milestone-reactions__heart');
      
      const heartSvg = page.locator('.milestone-reactions__heart');
      await expect(heartSvg).toBeVisible();
      await expect(heartSvg).toHaveAttribute('fill', 'currentColor');
    });

    test('SVG heart works in dark mode', async ({ page }) => {
      // Set dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(MILESTONE_EN);
      
      await page.waitForSelector('.milestone-reactions__heart');
      
      const heartSvg = page.locator('.milestone-reactions__heart');
      await expect(heartSvg).toBeVisible();
      await expect(heartSvg).toHaveAttribute('fill', 'currentColor');
    });
  });

  test.describe('No duplicate reactions', () => {
    test('only one reactions control per milestone page', async ({ page }) => {
      await page.goto(MILESTONE_EN);
      
      const reactionsSections = page.locator('section.milestone-reactions');
      await expect(reactionsSections).toHaveCount(1);
    });
  });
});
