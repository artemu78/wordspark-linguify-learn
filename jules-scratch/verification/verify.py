from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:8080/")

        # Check if we are on the login page
        if page.get_by_role("heading", name="WordSpark").is_visible():
            page.get_by_label("Email").fill("test@example.com")
            page.get_by_label("Password").fill("password")
            page.get_by_role("button", name="Sign In").click()
            page.screenshot(path="jules-scratch/verification/after_login.png")


        # Wait for the page to load
        expect(page.get_by_role("heading", name="Vocabulary Lists")).to_be_visible(timeout=10000)

        # Take a screenshot of the dashboard
        page.screenshot(path="jules-scratch/verification/dashboard.png")

        # Find a "Play Story" button and click it
        play_story_button = page.get_by_role("button", name="Play Story").first
        expect(play_story_button).to_be_visible()
        play_story_button.click()

        # Wait for the story page to load
        expect(page.get_by_role("heading", name="Story:")).to_be_visible()

        # Take a screenshot of the story page
        page.screenshot(path="jules-scratch/verification/story_page.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
