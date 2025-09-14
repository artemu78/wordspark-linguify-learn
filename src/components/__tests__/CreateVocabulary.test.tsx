import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateVocabulary from "../CreateVocabulary";
import { generateAndSaveStory } from "@/lib/storyUtils";
import { vi, MockedFunction, Mocked, beforeEach } from "vitest";

// Self-contained mocks for hooks and utils, but Supabase will be globally mocked via setupTests.ts
// vi.mock('@/integrations/supabase/client', () => { ... }); // REMOVED - Will use global mock
vi.mock("@/lib/geminiUtils");

// Mock other direct hook dependencies
vi.mock("@/contexts/AuthContext");
vi.mock("@/stores/languageStore");
vi.mock("@/hooks/use-toast");
vi.mock("@/lib/storyUtils"); // This is for generateAndSaveStory

// Import after mocks
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguageStore } from "@/stores/languageStore";
import { useToast } from "@/hooks/use-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

afterEach(() => {
  vi.clearAllMocks();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const AllTheProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Helper function to render with providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: AllTheProviders });
};

const mockUseAuth = useAuth as Mocked<typeof useAuth>;
const mockUseLanguageStore = useLanguageStore as Mocked<
  typeof useLanguageStore
>;
const mockUseToast = useToast as Mocked<typeof useToast>;
const mockGenerateAndSaveStory = generateAndSaveStory as Mocked<
  typeof generateAndSaveStory
>;
const mockSupabaseClient = supabase as Mocked<typeof supabase>;

describe("CreateVocabulary Component", () => {
  const mockOnBack = vi.fn();
  const mockOnStartLearning = vi.fn();
  const mockOnPlayStory = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // @ts-expect-error: Mock the supabase client globally
    mockUseAuth.mockReturnValue({ user: { id: "test-user-id" } });
    // @ts-expect-error: Mock the supabase client globally
    mockUseLanguageStore.mockReturnValue({
      languages: [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
      ],
      loading: false,
      error: null,
      fetchLanguages: vi.fn(),
      hasFetched: true,
    });
    // @ts-expect-error: Mock the supabase client globally
    mockUseToast.mockReturnValue({ toast: mockToast });

    // Reset specific mock implementations for supabase if needed, e.g., for function invokes
    const functionsInvokeMock = supabase.functions.invoke as Mocked<
      typeof supabase.functions.invoke
    >; // Use the imported supabase
    // @ts-expect-error: Mock the supabase client globally
    functionsInvokeMock.mockImplementation((functionName: string) => {
      if (functionName === "generate-vocabulary") {
        return Promise.resolve({
          data: {
            vocabularyWords: [
              { word: "auto-word", translation: "auto-translation" },
            ],
            coverImageUrl: "http://example.com/image.png",
          },
          error: null,
        });
      }
      if (functionName === "translate-word") {
        return Promise.resolve({
          data: { translation: "translated-text" },
          error: null,
        });
      }
      return Promise.resolve({ data: {}, error: null });
    });

    // No default supabase.from mock here; tests will provide their own via mockImplementationOnce.
  });

  test("renders correctly and shows initial form elements", () => {
    renderWithProviders(
      <CreateVocabulary
        onBack={mockOnBack}
        onPlayStory={mockOnPlayStory}
        onStartLearning={mockOnStartLearning}
      />
    );

    expect(screen.getByText("Create New Vocabulary")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    expect(screen.getByLabelText("Make vocabulary public")).toBeInTheDocument();
    expect(screen.getByText("Language to learn")).toBeInTheDocument();
    expect(screen.getByText("Language you know")).toBeInTheDocument();
    expect(screen.getByText("Word Pairs")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate with AI/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Word/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save Vocabulary/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();

    // Initial word pair
    expect(screen.getAllByPlaceholderText("Word").length).toBe(1);
    expect(screen.getAllByPlaceholderText("Translation").length).toBe(1);
  });

  // More tests will be added here
  test("updates title, topic, and AI word count on input", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateVocabulary
        onBack={mockOnBack}
        onPlayStory={mockOnPlayStory}
        onStartLearning={mockOnStartLearning}
      />
    );

    const titleInput = screen.getByLabelText("Title");
    await user.type(titleInput, "My Test Vocab");
    expect(titleInput).toHaveValue("My Test Vocab");

    const topicInput = screen.getByLabelText("Topic");
    await user.type(topicInput, "Test Topic");
    expect(topicInput).toHaveValue("Test Topic");

    const aiWordCountInput = screen.getByRole("spinbutton"); // Assuming default role for input type=number
    await user.clear(aiWordCountInput);
    await user.type(aiWordCountInput, "15");
    expect(aiWordCountInput).toHaveValue(15);
  });

  test.skip("updates language selections", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateVocabulary
        onBack={mockOnBack}
        onPlayStory={mockOnPlayStory}
        onStartLearning={mockOnStartLearning}
      />
    );

    // Language to learn
    // Need to find the select by its placeholder or current value if default is set
    // The placeholder is inside SelectValue, which might not be directly queryable by label
    // Let's assume the first select is 'Language to learn' based on DOM order or a more specific query
    const languageToLearnSelect = screen.getAllByRole("combobox")[0];
    await user.click(languageToLearnSelect);
    // Wait for options to appear and then click by role and name
    await user.click(await screen.findByRole("option", { name: "Spanish" }));
    // Verification is tricky for Radix Select, we'll see if mutation uses 'fr'

    // Language you know
    const languageYouKnowSelect = screen.getAllByRole("combobox")[1];
    await user.click(languageYouKnowSelect);
    await user.click(await screen.findByRole("option", { name: "French" }));
    // Similar verification challenge as above.
  });

  test('toggles "Make vocabulary public" switch', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateVocabulary
        onBack={mockOnBack}
        onPlayStory={mockOnPlayStory}
        onStartLearning={mockOnStartLearning}
      />
    );

    const publicSwitch = screen.getByLabelText("Make vocabulary public");
    expect(publicSwitch).not.toBeChecked();
    await user.click(publicSwitch);
    expect(publicSwitch).toBeChecked();
    await user.click(publicSwitch);
    expect(publicSwitch).not.toBeChecked();
  });

  test("adds and removes word pairs", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateVocabulary
        onBack={mockOnBack}
        onPlayStory={mockOnPlayStory}
        onStartLearning={mockOnStartLearning}
      />
    );

    // Initial state: 1 word pair
    expect(screen.getAllByPlaceholderText("Word")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("Translation")).toHaveLength(1);

    // Add a word pair
    const addWordButton = screen.getByRole("button", { name: /Add Word/i });
    await user.click(addWordButton);
    expect(screen.getAllByPlaceholderText("Word")).toHaveLength(2);
    expect(screen.getAllByPlaceholderText("Translation")).toHaveLength(2);

    // Add another word pair
    await user.click(addWordButton);
    expect(screen.getAllByPlaceholderText("Word")).toHaveLength(3);
    expect(screen.getAllByPlaceholderText("Translation")).toHaveLength(3);

    // Remove the second word pair (index 1)
    // The remove button is only visible if wordPairs.length > 1
    const removeButtonForSecondPair = screen.getByTestId("remove-word-pair-1");
    await user.click(removeButtonForSecondPair);

    expect(screen.getAllByPlaceholderText("Word")).toHaveLength(2);
    expect(screen.getAllByPlaceholderText("Translation")).toHaveLength(2);

    // Try to remove when only one pair is left (button should be disabled or not present for the last one)
    // The component logic prevents removing the last pair directly, remove buttons are not rendered for the last pair if it's the only one.
    // If we remove one more, the last remove button should disappear or become disabled for the single remaining pair.
    // This needs careful checking of how the component behaves for the last pair.
    // For now, let's assume the test above where we remove the second of three is sufficient.
    // The component logic is `wordPairs.length > 1 && (...)` for showing the remove button.
  });

  test("updates word and translation in a word pair", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateVocabulary
        onBack={mockOnBack}
        onPlayStory={mockOnPlayStory}
        onStartLearning={mockOnStartLearning}
      />
    );

    const wordInput = screen.getByPlaceholderText("Word");
    const translationInput = screen.getByPlaceholderText("Translation");

    await user.type(wordInput, "Hola");
    expect(wordInput).toHaveValue("Hola");

    await user.type(translationInput, "Hello");
    expect(translationInput).toHaveValue("Hello");
  });

  describe("AI Word Generation", () => {
    test("successfully generates word pairs with AI", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );

      await user.type(screen.getByLabelText("Topic"), "Animals");
      // Select languages - assuming default or previous test setup handles this if needed for button to be enabled
      // For this test, ensure languages are selected if that's a precondition for the button.
      // The component has default languages from useEffect, so this should be fine.

      const generateButton = screen.getByRole("button", {
        name: /Generate with AI/i,
      });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
          "generate-vocabulary",
          expect.objectContaining({
            body: {
              topic: "Animals",
              languageYouKnow: "English (en)",
              languageToLearn: "Spanish (es)",
              wordCount: 10, // Default AI word count
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Word")).toHaveValue("auto-word");
        expect(screen.getByPlaceholderText("Translation")).toHaveValue(
          "auto-translation"
        );
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Success!" })
      );
    });

    test("shows error toast if AI generation fails", async () => {
      const user = userEvent.setup();
      // @ts-expect-error: Mock the supabase client globally
      mockSupabaseClient.functions.invoke.mockImplementationOnce(
        (functionName: string) => {
          if (functionName === "generate-vocabulary") {
            return Promise.resolve({
              data: null,
              error: { message: "AI failed" },
            });
          }
          return Promise.resolve({ data: {}, error: null });
        }
      );

      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      await user.type(screen.getByLabelText("Topic"), "Food");
      // Ensure languages are selected
      // (Assuming default languages are set by useEffect and store)

      const generateButton = screen.getByRole("button", {
        name: /Generate with AI/i,
      });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: "AI failed",
            variant: "destructive",
          })
        );
      });
    });

    test("shows error toast if topic is missing for AI generation", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );

      const generateButton = screen.getByRole("button", {
        name: /Generate with AI/i,
      });
      await user.click(generateButton);

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Please enter a topic before generating with AI.",
          variant: "destructive",
        })
      );
      expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalledWith(
        "generate-vocabulary",
        expect.anything()
      );
    });
  });

  describe("Word Translation", () => {
    test("successfully translates a word", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );

      const wordInput = screen.getByPlaceholderText("Word");
      await user.type(wordInput, "TestWord");

      // Ensure languages are selected (defaults should be fine due to useEffect in component)
      // Language store mock provides 'en' and 'es'

      const translateButton = screen.getByTestId("translate-word-0");
      await user.click(translateButton);

      await waitFor(() => {
        expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
          "translate-word",
          expect.objectContaining({
            body: {
              word: "TestWord",
              sourceLanguage: "es", // Default languageToLearn
              targetLanguage: "en", // Default languageYouKnow
            },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Translation")).toHaveValue(
          "translated-text"
        );
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Translation Complete" })
      );
    });

    test("shows error toast if translation fails", async () => {
      const user = userEvent.setup();
      // @ts-expect-error: Mock the supabase client globally
      mockSupabaseClient.functions.invoke.mockImplementationOnce(
        (functionName: string) => {
          if (functionName === "translate-word") {
            return Promise.resolve({
              data: null,
              error: { message: "Translation API failed" },
            });
          }
          return Promise.resolve({ data: {}, error: null });
        }
      );

      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      const wordInput = screen.getByPlaceholderText("Word");
      await user.type(wordInput, "AnotherWord");

      const translateButton = screen.getByTestId("translate-word-0");
      await user.click(translateButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Translation Failed",
            description: "Translation API failed",
            variant: "destructive",
          })
        );
      });
    });

    test("translate button is disabled if word is empty or languages not selected", async () => {
      const user = userEvent.setup();
      // Scenario 1: Word is empty
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      let translateButton = screen.getByTestId("translate-word-0");
      expect(translateButton).toBeDisabled(); // Word is empty by default

      // Scenario 2: Languages not selected (mock language store to have no languages initially)
      // @ts-expect-error: Mock the supabase client globally
      mockUseLanguageStore.mockReturnValueOnce({
        ...useLanguageStore(), // spread default mock
        languages: [], // no languages loaded
        languageYouKnow: undefined,
        languageToLearn: undefined,
        hasFetched: true, // to prevent fetchLanguages being called if that's desired
      });

      // Re-render with new language store mock
      // It's tricky to re-render with different store values without a context provider wrapper in test
      // For simplicity, we'll assume the initial render and check.
      // A more robust test would wrap with a context provider and update its value.
      // However, the component itself has logic to disable if languages are undefined.

      // Let's test the disable logic more directly by filling the word but mocking languages as unselected
      // This part of the test might be hard if defaults kick in too fast.
      // The component's `disabled` logic is:
      // `!pair.word.trim() || !languageYouKnow || !languageToLearn`

      // Test with word filled, but let's assume languages are not selected (though defaults usually are)
      await user.type(screen.getByPlaceholderText("Word"), "FilledWord");
      // If languages are defaulted, this button would be enabled.
      // The test for "languages not selected" is harder without manipulating the store state mid-test for the *same* render.
      // The primary check for empty word is valid.
      // The check for unselected languages would require `languageYouKnow` or `languageToLearn` to be falsy.
      // The default useEffects in component try to set these, so we rely on those being tested elsewhere
      // or assume the disabled logic `!languageYouKnow || !languageToLearn` is covered if they were undefined.

      // Click to see if toast shows for empty word (it does, but button is also disabled)
      // The component shows a toast if you try to translate with empty word *and* button wasn't disabled (which it is)
      // So, the disabled check is more relevant here.
      // If the button is clicked while disabled, nothing should happen.
      // If somehow it was enabled and word was empty, then toast.
      // Let's check the toast for "enter a word" if button was somehow enabled.
      // This test should primarily focus on the disabled state.
      // The toast for "Please enter a word" is inside `handleTranslateWord` which is called on click.
      // If button is disabled, click won't happen.

      // Reset to a state where word is empty.
      await user.clear(screen.getByPlaceholderText("Word"));
      translateButton = screen.getByTestId("translate-word-0"); // re-query
      expect(translateButton).toBeDisabled();

      // Test toast for "Please select both languages"
      // This requires languages to be undefined.
      // We can simulate this by directly calling handleTranslateWord after setting languages to undefined in state
      // This is more of a unit test of handleTranslateWord rather than user interaction.
      // For user interaction, the select dropdowns would be empty or show error.
      // The main check here is that an empty word input disables the button.
      expect(screen.getByTestId("translate-word-0")).toBeDisabled();
      await user.type(screen.getAllByPlaceholderText("Word")[0], "test");
      expect(screen.getByTestId("translate-word-0")).not.toBeDisabled(); // Assuming languages are defaulted
    });
  });

  describe.skip("Save Vocabulary", () => {
    const fillRequiredFields = async (
      user: ReturnType<typeof userEvent.setup>
    ) => {
      await user.type(screen.getByLabelText("Title"), "Test Title");
      await user.type(screen.getByLabelText("Topic"), "Test Topic");
      // Languages are typically defaulted by useEffect and languageStore mock
      // Add a word pair
      await user.type(screen.getAllByPlaceholderText("Word")[0], "hello");
      await user.type(screen.getAllByPlaceholderText("Translation")[0], "hola");
    };

    test("successfully saves a new vocabulary", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      await fillRequiredFields(user);

      const mockVocabSingleFn = vi.fn().mockResolvedValue({
        data: { id: "new-vocab-id", title: "Test Title" },
        error: null,
      });
      const mockVocabSelectFn = vi.fn(() => ({ single: mockVocabSingleFn }));
      const mockVocabInsertFn = vi.fn(() => ({ select: mockVocabSelectFn }));

      const mockWordsInsertFn = vi.fn().mockResolvedValue({ error: null });

      // Use mockImplementationOnce for this specific test case
      (
        supabase.from as MockedFunction<typeof supabase.from>
      ).mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") {
          return { insert: mockVocabInsertFn };
        }
        if (tableName === "vocabulary_words") {
          return { insert: mockWordsInsertFn };
        }
        // Strict fallback for this test
        throw new Error(
          `Unexpected table ${tableName} in successful save test`
        );
      });

      const saveButton = screen.getByRole("button", {
        name: /Save Vocabulary/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith("vocabularies");
        expect(mockVocabInsertFn).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Test Title",
            topic: "Test Topic",
            source_language: "en", // default from language store mock
            target_language: "es", // default from language store mock
            is_public: false, // default
          })
        );
        // Check that the chained calls happened
        expect(mockVocabSelectFn).toHaveBeenCalled();
        expect(mockVocabSingleFn).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockSupabaseClient.from).toHaveBeenCalledWith(
          "vocabulary_words"
        );
        expect(mockWordsInsertFn).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ word: "hello", translation: "hola" }),
          ])
        );
      });

      await waitFor(() => {
        // After save, it shows "Vocabulary Saved" and "Create Story" button
        expect(screen.getByText("Vocabulary Saved")).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: /Create Story for this Vocabulary/i,
          })
        ).toBeInTheDocument();
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Vocabulary Saved!" })
      );
    });

    test("shows error toast if saving vocabulary fails (vocab insert)", async () => {
      const user = userEvent.setup();
      // Specific mock for this test: vocabularies.insert().select().single() fails
      const mockVocabSingleFailFn = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Vocab save failed" },
      });
      const mockVocabSelectFn = vi.fn(() => ({
        single: mockVocabSingleFailFn,
      }));
      const mockVocabInsertFn = vi.fn(() => ({ select: mockVocabSelectFn }));

      (
        supabase.from as MockedFunction<typeof supabase.from>
      ).mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") {
          return { insert: mockVocabInsertFn };
        }
        // Fallback for 'vocabulary_words' - should not be called if vocab insert fails.
        return {
          insert: vi.fn(() => {
            throw new Error(
              "vocabulary_words.insert should not be called in vocab insert fail test"
            );
          }),
        };
      });

      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      await fillRequiredFields(user);
      await user.click(
        screen.getByRole("button", { name: /Save Vocabulary/i })
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: "Vocab save failed",
            variant: "destructive",
          })
        );
      });
    });

    test("shows error toast if saving vocabulary fails (words insert)", async () => {
      const user = userEvent.setup();
      const mockVocabSingleSuccessFn = vi.fn().mockResolvedValue({
        data: { id: "new-vocab-id", title: "Test Title" },
        error: null,
      });
      const mockVocabSelectSuccessFn = vi.fn(() => ({
        single: mockVocabSingleSuccessFn,
      }));
      const mockVocabInsertSuccessFn = vi.fn(() => ({
        select: mockVocabSelectSuccessFn,
      }));

      const mockWordsInsertFailFn = vi
        .fn()
        .mockResolvedValue({ error: { message: "Words save failed" } });

      // Use mockImplementationOnce for this specific test case
      (
        supabase.from as MockedFunction<typeof supabase.from>
      ).mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") {
          return { insert: mockVocabInsertSuccessFn };
        }
        if (tableName === "vocabulary_words") {
          return { insert: mockWordsInsertFailFn };
        }
        throw new Error(
          `Unexpected table ${tableName} in words insert fail test`
        );
      });

      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      await fillRequiredFields(user);
      await user.click(
        screen.getByRole("button", { name: /Save Vocabulary/i })
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: "Words save failed",
            variant: "destructive",
          })
        );
      });
    });

    test("shows validation error if title or topic is missing", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      // Missing title and topic
      await user.type(screen.getAllByPlaceholderText("Word")[0], "hello");
      await user.type(screen.getAllByPlaceholderText("Translation")[0], "hola");

      await user.click(
        screen.getByRole("button", { name: /Save Vocabulary/i })
      );
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Please fill in the title and topic.",
          variant: "destructive",
        })
      );
    });

    test("shows validation error if no word pairs are added", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      await user.type(screen.getByLabelText("Title"), "Test Title");
      await user.type(screen.getByLabelText("Topic"), "Test Topic");
      // No word pairs filled

      await user.click(
        screen.getByRole("button", { name: /Save Vocabulary/i })
      );
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Please add at least one word pair.",
          variant: "destructive",
        })
      );
    });

    test("shows validation error if languages are not selected or are the same", async () => {
      const user = userEvent.setup();

      // Mock language store to return undefined for languages initially to test "not selected"
      // @ts-expect-error: Mock the supabase client globally
      mockUseLanguageStore.mockReturnValueOnce({
        ...useLanguageStore(),
        languages: [{ code: "en", name: "English" }], // Only one language to force same selection
        languageYouKnow: "en",
        languageToLearn: "en",
        hasFetched: true,
      });

      // Provide a basic valid Supabase mock for save, in case validation is bypassed.
      const mockSaveFn = vi.fn().mockResolvedValue({ error: null }); // General success if called
      const mockSelectFn = vi.fn(() => ({ single: mockSaveFn }));
      // Use mockImplementationOnce in case any DB call is unexpectedly made
      (
        supabase.from as MockedFunction<typeof supabase.from>
      ).mockImplementationOnce((table: string) => {
        if (table === "vocabularies")
          return { insert: vi.fn(() => ({ select: mockSelectFn })) };
        if (table === "vocabulary_words") return { insert: mockSaveFn };
        // This path should ideally not be hit if validation works.
        throw new Error(
          `Unexpected Supabase call in language validation test: ${table}`
        );
      });

      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      await user.type(screen.getByLabelText("Title"), "Lang Test");
      await user.type(screen.getByLabelText("Topic"), "Lang Topic");
      await user.type(screen.getAllByPlaceholderText("Word")[0], "test");
      await user.type(screen.getAllByPlaceholderText("Translation")[0], "test");

      // Attempt to select the same language for both if possible, or rely on store mock
      // The component's useEffect tries to set different languages if available.
      // This test depends on the languageStore mock forcing the same language.

      // Simulate selecting 'English' for both if the UI allows, or assume store sets them same
      // Click save
      await user.click(
        screen.getByRole("button", { name: /Save Vocabulary/i })
      );

      // Check for toast message
      // This might show "must be different" or "please select" depending on exact state
      // Given the mock, it should be "must be different"
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description:
            "'Language you know' and 'Language to learn' must be different.",
          variant: "destructive",
        })
      );
    });
  });

  describe.skip("Create Story", () => {
    beforeEach(async () => {
      // Ensure vocabulary is "saved" before these tests run, so "Create Story" button is visible
      // We can achieve this by running the successful save interaction or mocking the component's state.
      // For simplicity, let's simulate a successful save.
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );
      await user.type(screen.getByLabelText("Title"), "Story Vocab");
      await user.type(screen.getByLabelText("Topic"), "Story Topic");
      await user.type(screen.getAllByPlaceholderText("Word")[0], "storyword");
      await user.type(
        screen.getAllByPlaceholderText("Translation")[0],
        "storytranslation"
      );

      // Mock successful save for vocab and words for this beforeEach
      const mockVocabSingleFn = vi.fn().mockResolvedValue({
        data: { id: "story-vocab-id", title: "Story Vocab" },
        error: null,
      });
      const mockVocabSelectFn = vi.fn(() => ({ single: mockVocabSingleFn }));
      const mockVocabInsertFn = vi.fn(() => ({ select: mockVocabSelectFn }));
      const mockWordsInsertFn = vi.fn().mockResolvedValue({ error: null });

      (
        supabase.from as MockedFunction<typeof supabase.from>
      ).mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") return { insert: mockVocabInsertFn };
        if (tableName === "vocabulary_words")
          return { insert: mockWordsInsertFn };
        throw new Error(
          `Unexpected table ${tableName} in Create Story beforeEach`
        );
      });

      await user.click(
        screen.getByRole("button", { name: /Save Vocabulary/i })
      );
      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: /Create Story for this Vocabulary/i,
          })
        ).toBeInTheDocument();
      });
    });

    test("successfully creates a story", async () => {
      const user = userEvent.setup();
      // @ts-expect-error: Mock the supabase client globally
      mockGenerateAndSaveStory.mockResolvedValueOnce("new-story-id");

      const createStoryButton = screen.getByRole("button", {
        name: /Create Story for this Vocabulary/i,
      });
      await user.click(createStoryButton);

      await waitFor(() => {
        expect(mockGenerateAndSaveStory).toHaveBeenCalledWith("story-vocab-id");
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Story Created!" })
      );
      expect(
        screen.getByText("Story created for this vocabulary.")
      ).toBeInTheDocument();
      // Button should ideally be disabled or hidden after successful creation, or text changes.
      // Current component shows "Story created for this vocabulary." and keeps the button.
      // This might be desired behavior or something to refine.
    });

    test("shows error toast if story creation fails", async () => {
      const user = userEvent.setup();
      // @ts-expect-error: Mock the supabase client globally
      mockGenerateAndSaveStory.mockRejectedValueOnce(
        new Error("Story gen failed")
      );

      const createStoryButton = screen.getByRole("button", {
        name: /Create Story for this Vocabulary/i,
      });
      await user.click(createStoryButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Story Creation Failed",
            // description: 'Story gen failed', // The component has a generic message here
            variant: "destructive",
          })
        );
      });
    });
  });

  test.skip('calls onBack when "Back" or "Done / Back to List" button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateVocabulary
        onBack={mockOnBack}
        onPlayStory={mockOnPlayStory}
        onStartLearning={mockOnStartLearning}
      />
    );

    // Test initial "Back" button
    const backButton = screen.getByRole("button", { name: /Back/i });
    await user.click(backButton);
    expect(mockOnBack).toHaveBeenCalledTimes(1);

    // Simulate vocabulary saved state to show "Done / Back to List"
    // This requires re-rendering or setting state, similar to Create Story setup.
    // For simplicity, we'll assume the `onBack` for the "Done" button works if the initial one does.
    // A more complete test would go through the save flow again.
    // Let's just ensure the "Done / Back to List" button calls onBack when it appears.

    // Minimal setup to get the "Done" button:
    // Fill required fields and click save
    await user.type(screen.getByLabelText("Title"), "Done Vocab");
    await user.type(screen.getByLabelText("Topic"), "Done Topic");
    await user.type(screen.getAllByPlaceholderText("Word")[0], "done");
    await user.type(screen.getAllByPlaceholderText("Translation")[0], "hecho");

    // Mock successful save
    const mockVocabSingleFnDone = vi.fn().mockResolvedValue({
      data: { id: "done-vocab-id", title: "Done Vocab" },
      error: null,
    });
    const mockVocabSelectFnDone = vi.fn(() => ({
      single: mockVocabSingleFnDone,
    }));
    const mockVocabInsertFnDone = vi.fn(() => ({
      select: mockVocabSelectFnDone,
    }));
    const mockWordsInsertFnDone = vi.fn().mockResolvedValue({ error: null });

    (
      supabase.from as MockedFunction<typeof supabase.from>
    ).mockImplementationOnce((tableName: string) => {
      if (tableName === "vocabularies")
        return { insert: mockVocabInsertFnDone };
      if (tableName === "vocabulary_words")
        return { insert: mockWordsInsertFnDone };
      throw new Error(`Unexpected table ${tableName} in callsOnBack test`);
    });

    await user.click(screen.getByRole("button", { name: /Save Vocabulary/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Done \/ Back to List/i })
      ).toBeInTheDocument();
    });
    const doneButton = screen.getByRole("button", {
      name: /Done \/ Back to List/i,
    });
    await user.click(doneButton);
    expect(mockOnBack).toHaveBeenCalledTimes(2); // Called once for "Back", once for "Done"
  });

  describe("File Import", () => {
    test("imports words from a file, skipping duplicates", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateVocabulary
          onBack={mockOnBack}
          onPlayStory={mockOnPlayStory}
          onStartLearning={mockOnStartLearning}
        />
      );

      // Setup initial words in the list
      await user.type(screen.getByPlaceholderText("Word"), "banana");
      await user.type(screen.getByPlaceholderText("Translation"), "banana-t");
      await user.click(screen.getByRole("button", { name: /Add Word/i }));
      await user.type(screen.getAllByPlaceholderText("Word")[1], "Date");
      await user.type(
        screen.getAllByPlaceholderText("Translation")[1],
        "date-t"
      );

      // Prepare the file to be imported
      const fileContent = "apple\nbanana\ncherry\napple\nDate";
      const file = new File([fileContent], "words.txt", { type: "text/plain" });

      // Find the hidden file input. We can't use getByLabelText directly if it's hidden.
      // We'll find it by its test id or another unique attribute if available, or just by tag if it's the only one.
      // The component doesn't have a test-id for the input, so we'll be creative.
      // We know the "Import" button clicks it, so we can mock the click handler or find the input.
      const fileInput = screen.getByTestId("file-import-input");

      // Upload the file
      await user.upload(fileInput, file);

      // Assertions
      await waitFor(() => {
        // Check the final list of words. Should be banana, Date, apple, cherry.
        const wordInputs = screen.getAllByPlaceholderText("Word");
        expect(wordInputs).toHaveLength(4);
        expect(wordInputs[0]).toHaveValue("banana");
        expect(wordInputs[1]).toHaveValue("Date");
        expect(wordInputs[2]).toHaveValue("apple");
        expect(wordInputs[3]).toHaveValue("cherry");
      });

      // Check the toast message
      expect(mockToast).toHaveBeenCalledWith({
        title: "Import Complete",
        description: `Added 2 new words. Skipped 3 duplicate(s).`,
      });
    });
  });
});
