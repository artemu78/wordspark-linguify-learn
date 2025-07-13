import { Mocked, vi } from "vitest";

// Make this file self-contained for mocking, disabling global mocks from setupTests.ts
vi.mock("@/integrations/supabase/client", () => {
  const actualFromMock = vi.fn(); // This will be the core 'from' mock we interact with
  return {
    supabase: {
      from: actualFromMock,
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { selfContainedInvoke: true },
          error: null,
        }),
      },
      auth: { // Basic auth mock if needed by any indirect imports
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "self-contained-user" } },
          error: null,
        }),
      },
      rpc: vi.fn().mockResolvedValue({
        data: { selfContainedRpc: true },
        error: null,
      }),
    },
  };
});

vi.mock("@/lib/geminiUtils", () => ({
  generateStoryFromWords: vi.fn().mockResolvedValue([]), // Default to empty array
  GeminiGenerationError: class extends Error { // Mock the error class too
    details: any;
    constructor(message: string, details?: any) {
      super(message);
      this.name = "MockedGeminiGenerationError";
      this.details = details;
    }
  },
}));

// Now import the modules AFTER setting up the mocks for them
import { supabase } from "@/integrations/supabase/client";
import {
  GeminiGenerationError,
  generateStoryFromWords,
} from "@/lib/geminiUtils";
import { generateAndSaveStory, StoryGenerationError } from "../storyUtils";

// Cast to Vitest's Mocked type
const mockSupabase = supabase as Mocked<typeof supabase>; // supabase is now the mocked object from above
const mockGenerateStoryFromWords = generateStoryFromWords as Mocked<
  typeof generateStoryFromWords
>; // also mocked

describe("generateAndSaveStory", () => {
  const vocabularyId = "test-vocab-id";
  const mockVocabulary = {
    id: vocabularyId,
    title: "Test Vocab Title",
    source_language: "en",
    target_language: "es",
  };
  const mockWords = [
    { id: "w1", word: "hello", translation: "hola" },
    { id: "w2", word: "world", translation: "mundo" },
  ];
  const mockGeminiBits = [
    {
      word: "hello",
      storyBitDescription: "Story about hello",
      storyBitDescriptionInLanguageYouKnow: "Historia sobre hola",
      imagePrompt: "Prompt for hello",
    },
    {
      word: "world",
      storyBitDescription: "Story about world",
      storyBitDescriptionInLanguageYouKnow: "Historia sobre mundo",
      imagePrompt: "Prompt for world",
    },
  ];
  const mockNewStoryId = "new-story-123";

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful path mocks
    // Define interfaces for chainable mock structures for type safety
    interface MockSupabaseSingleResponse {
      data: any;
      error: any;
    }
    interface MockSupabaseEqChain {
      single: MockedFunction<() => Promise<MockSupabaseSingleResponse>>;
    }
    interface MockSupabaseSelectChain {
      eq: MockedFunction<(col: string, val: any) => MockSupabaseEqChain>;
    }
    // Define interfaces for chainable mock structures for type safety (can be kept for reference or removed if too verbose for each test)
    // interface MockSupabaseSingleResponse { data: any; error: any; }
    // interface MockSupabaseEqChain { single: MockedFunction<() => Promise<MockSupabaseSingleResponse>>; }
    // interface MockSupabaseSelectChain { eq: MockedFunction<(col: string, val: any) => MockSupabaseEqChain>; }
    // interface MockSupabaseInsertChain { select: MockedFunction<() => { single: MockedFunction<() => Promise<MockSupabaseSingleResponse>>}>; }
    // interface MockSupabaseDeleteChain { eq: MockedFunction<(col: string, val: any) => Promise<{ error: any }>>; }

    // No default mockImplementation for supabase.from in beforeEach. Each test will set its own.
    mockGenerateStoryFromWords.mockResolvedValue(mockGeminiBits); // Default for successful path
  });

  test("successfully generates and saves a story", async () => {
    // Setup specific mock for this test
    const mockVocabSingleFn = vi.fn().mockResolvedValue({
      data: mockVocabulary,
      error: null,
    });
    const mockVocabEqFn = vi.fn(() => ({ single: mockVocabSingleFn }));
    const mockVocabSelectFn = vi.fn(() => ({ eq: mockVocabEqFn }));

    const mockWordsEqFn = vi.fn().mockResolvedValue({
      data: mockWords,
      error: null,
    });
    const mockWordsSelectFn = vi.fn(() => ({ eq: mockWordsEqFn }));

    const mockStorySingleFn = vi.fn().mockResolvedValue({
      data: { id: mockNewStoryId },
      error: null,
    });
    const mockStorySelectAfterInsertFn = vi.fn(() => ({
      single: mockStorySingleFn,
    }));
    const mockStoryInsertFn = vi.fn(() => ({
      select: mockStorySelectAfterInsertFn,
    }));

    const mockStoryBitsInsertFn = vi.fn().mockResolvedValue({ error: null });

    (mockSupabase.from as MockedFunction<typeof supabase.from>)
      .mockImplementation((tableName: string) => {
        if (tableName === "vocabularies") return { select: mockVocabSelectFn };
        if (tableName === "vocabulary_words") {
          return { select: mockWordsSelectFn };
        }
        if (tableName === "stories") return { insert: mockStoryInsertFn };
        if (tableName === "story_bits") {
          return { insert: mockStoryBitsInsertFn };
        }
        return {} as any; // Should not be reached if test is specific enough
      });

    const storyId = await generateAndSaveStory(vocabularyId);
    expect(storyId).toBe(mockNewStoryId);

    expect(mockSupabase.from).toHaveBeenCalledWith("vocabularies");
    expect(mockVocabSelectFn).toHaveBeenCalledWith(
      "title, source_language, target_language",
    );
    expect(mockVocabEqFn).toHaveBeenCalledWith("id", vocabularyId);
    expect(mockVocabSingleFn).toHaveBeenCalled();

    expect(mockSupabase.from).toHaveBeenCalledWith("vocabulary_words");
    expect(mockWordsSelectFn).toHaveBeenCalledWith("id, word, translation");
    expect(mockWordsEqFn).toHaveBeenCalledWith("vocabulary_id", vocabularyId);

    expect(mockGenerateStoryFromWords).toHaveBeenCalledWith(
      mockWords.map((w) => ({ word: w.word, translation: w.translation })),
      mockVocabulary.title,
      mockVocabulary.source_language,
      mockVocabulary.target_language,
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("stories");
    // @ts-ignore
    const storyInsertArg = mockSupabase.from("stories").insert.mock.calls[0][0];
    expect(storyInsertArg).toEqual({
      vocabulary_id: vocabularyId,
      title: `${mockVocabulary.title} - AI Story`,
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("story_bits");
    // @ts-ignore
    const storyBitsInsertArg =
      mockSupabase.from("story_bits").insert.mock.calls[0][0];
    expect(storyBitsInsertArg).toHaveLength(mockGeminiBits.length);
    expect(storyBitsInsertArg[0]).toEqual(expect.objectContaining({
      story_id: mockNewStoryId,
      sequence_number: 1,
      word: mockGeminiBits[0].word,
      sentence: mockGeminiBits[0].storyBitDescription,
      sentence_language_you_know:
        mockGeminiBits[0].storyBitDescriptionInLanguageYouKnow,
      image_prompt: mockGeminiBits[0].imagePrompt,
      image_url: null,
    }));
  });

  // Error handling tests will follow

  test("throws StoryGenerationError if fetching vocabulary details fails", async () => {
    const mockVocabSingleFn = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    const mockVocabEqFn = vi.fn(() => ({ single: mockVocabSingleFn }));
    const mockVocabSelectFn = vi.fn(() => ({ eq: mockVocabEqFn }));

    const mockSingleFn = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    (mockSupabase.from as MockedFunction<typeof supabase.from>)
      .mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: mockSingleFn,
              })),
            })),
          };
        }
        // Minimal fallback for other table calls if any occur before the expected failure point
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: {}, error: null }),
            })),
          })),
        } as any;
      });

    mockGenerateStoryFromWords.mockReset().mockResolvedValue([]); // Ensure other parts are quiet

    await expect(generateAndSaveStory(vocabularyId)).rejects.toThrowError(
      expect.objectContaining({
        name: "StoryGenerationError",
        code: "FETCH_VOCAB_FAILED",
        message: expect.stringContaining(
          "Failed to fetch vocabulary details: DB error",
        ),
      }),
    );
    expect(mockSingleFn).toHaveBeenCalled();
  });

  test("throws StoryGenerationError if vocabulary is not found", async () => {
    const mockVocabSingleFn = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }); // Vocab not found
    const mockVocabEqFn = vi.fn(() => ({ single: mockVocabSingleFn }));
    const mockVocabSelectFn = vi.fn(() => ({ eq: mockVocabEqFn }));

    (mockSupabase.from as MockedFunction<typeof supabase.from>)
      .mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") return { select: mockVocabSelectFn };
        return {} as any;
      });
    await expect(generateAndSaveStory(vocabularyId)).rejects.toMatchObject({
      code: "VOCAB_NOT_FOUND",
    });
  });

  test.skip("throws StoryGenerationError if fetching words fails", async () => {
    const fromSpy = vi.spyOn(mockSupabase, "from");
    const mockWordsEqFailFn = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Words DB error" },
    });

    fromSpy.mockImplementationOnce((tableName: string) => {
      if (tableName === "vocabularies") {
        const vocabSingleSuccess = vi.fn().mockResolvedValue({
          data: mockVocabulary,
          error: null,
        });
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vocabSingleSuccess })),
          })),
        };
      }
      if (tableName === "vocabulary_words") {
        return { select: vi.fn(() => ({ eq: wordsEqMock })) };
      }
      // Strict fallback: if any other table is called, this test's premise is wrong or mock is incomplete.
      console.error(
        `Unexpected table call in 'fetching words fails' test: ${tableName}`,
      );
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            throw new Error(`Unexpected .eq call for ${tableName}`);
          }),
          single: vi.fn(() => {
            throw new Error(`Unexpected .single call for ${tableName}`);
          }),
        })),
        insert: vi.fn(() => {
          throw new Error(`Unexpected .insert call for ${tableName}`);
        }),
      } as any;
    });

    mockGenerateStoryFromWords.mockReset().mockResolvedValue([]);

    await expect(generateAndSaveStory(vocabularyId)).rejects.toThrowError(
      expect.objectContaining({
        name: "StoryGenerationError",
        code: "FETCH_WORDS_FAILED",
      }),
    );
    expect(mockWordsEqFailFn).toHaveBeenCalled();
    fromSpy.mockRestore();
  });

  test.skip("throws StoryGenerationError if no words are found for vocabulary", async () => {
    const fromSpy = vi.spyOn(mockSupabase, "from");
    const mockWordsEqNoDataFn = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    }); // No words found

    fromSpy.mockImplementationOnce((tableName: string) => {
      if (tableName === "vocabularies") {
        const vocabSingleSuccess = vi.fn().mockResolvedValue({
          data: mockVocabulary,
          error: null,
        });
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vocabSingleSuccess })),
          })),
        };
      }
      if (tableName === "vocabulary_words") {
        return { select: vi.fn(() => ({ eq: wordsEqMock })) };
      }
      console.error(
        `Unexpected table call in 'no words found' test: ${tableName}`,
      );
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            throw new Error(`Unexpected .eq call for ${tableName}`);
          }),
          single: vi.fn(() => {
            throw new Error(`Unexpected .single call for ${tableName}`);
          }),
        })),
        insert: vi.fn(() => {
          throw new Error(`Unexpected .insert call for ${tableName}`);
        }),
      } as any;
    });

    mockGenerateStoryFromWords.mockReset().mockResolvedValue([]);

    await expect(generateAndSaveStory(vocabularyId)).rejects.toThrowError(
      expect.objectContaining({
        name: "StoryGenerationError",
        code: "NO_WORDS_FOUND",
      }),
    );
    expect(mockWordsEqNoDataFn).toHaveBeenCalled();
    fromSpy.mockRestore();
  });

  test("throws StoryGenerationError if languages are missing from vocabulary", async () => {
    const vocabWithoutLanguages = {
      ...mockVocabulary,
      source_language: null,
      target_language: null,
    }; // Key change for this test

    const mockVocabSingleFn = vi.fn().mockResolvedValue({
      data: vocabWithoutLanguages,
      error: null,
    });
    const mockVocabEqFn = vi.fn(() => ({ single: mockVocabSingleFn }));
    const mockVocabSelectFn = vi.fn(() => ({ eq: mockVocabEqFn }));

    const mockWordsEqFn = vi.fn().mockResolvedValue({
      data: mockWords,
      error: null,
    }); // Words are fine
    const mockWordsSelectFn = vi.fn(() => ({ eq: mockWordsEqFn }));

    (mockSupabase.from as MockedFunction<typeof supabase.from>)
      .mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") return { select: mockVocabSelectFn };
        if (tableName === "vocabulary_words") {
          return { select: mockWordsSelectFn };
        }
        return {} as any;
      });
    // This specific error is thrown *before* calling geminiUtils, directly within generateAndSaveStory
    await expect(generateAndSaveStory(vocabularyId)).rejects.toThrowError(
      expect.objectContaining({
        name: "StoryGenerationError",
        code: "LANGUAGES_MISSING",
      }),
    );
  });

  test("throws StoryGenerationError if generateStoryFromWords (Gemini) fails", async () => {
    // Vocab and Words fetch successfully
    const mockVocabSingleFn = vi.fn().mockResolvedValue({
      data: mockVocabulary,
      error: null,
    });
    const mockVocabEqFn = vi.fn(() => ({ single: mockVocabSingleFn }));
    const mockVocabSelectFn = vi.fn(() => ({ eq: mockVocabEqFn }));

    const mockWordsEqFn = vi.fn().mockResolvedValue({
      data: mockWords,
      error: null,
    });
    const mockWordsSelectFn = vi.fn(() => ({ eq: mockWordsEqFn }));

    (mockSupabase.from as MockedFunction<typeof supabase.from>)
      .mockImplementationOnce((tableName: string) => {
        if (tableName === "vocabularies") return { select: mockVocabSelectFn };
        if (tableName === "vocabulary_words") {
          return { select: mockWordsSelectFn };
        }
        return {} as any;
      });

    mockGenerateStoryFromWords.mockReset(); // Ensure it's clean for this test
    mockGenerateStoryFromWords.mockRejectedValueOnce(
      new GeminiGenerationError("Gemini API error", { detail: "some detail" }),
    );

    await expect(generateAndSaveStory(vocabularyId)).rejects.toThrowError(
      expect.objectContaining({
        name: "StoryGenerationError",
        code: "STORY_SERVICE_FAILED",
        message: "Story generation service failed: Gemini API error", // Exact message
      }),
    );
  });

  test.skip("throws StoryGenerationError if creating story entry in Supabase fails", async () => {
    const mockVocabSingleFn = vi.fn().mockResolvedValue({
      data: mockVocabulary,
      error: null,
    });
    const mockVocabEqFn = vi.fn(() => ({ single: mockVocabSingleFn }));
    const mockVocabSelectFn = vi.fn(() => ({ eq: mockVocabEqFn }));

    const mockWordsEqFn = vi.fn().mockResolvedValue({
      data: mockWords,
      error: null,
    });
    const mockWordsSelectFn = vi.fn(() => ({ eq: mockWordsEqFn }));

    const fromSpy = vi.spyOn(mockSupabase, "from");
    const storySingleFailMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Story insert DB error" },
    });

    fromSpy.mockImplementationOnce((tableName: string) => {
      if (tableName === "vocabularies") {
        const vocabSingleSuccess = vi.fn().mockResolvedValue({
          data: mockVocabulary,
          error: null,
        });
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vocabSingleSuccess })),
          })),
        };
      }
      if (tableName === "vocabulary_words") { // Words success
        const wordsEq = vi.fn().mockResolvedValue({
          data: mockWords,
          error: null,
        });
        return { select: vi.fn(() => ({ eq: wordsEq })) } as any;
      }
      if (tableName === "stories") { // Story insert fails at the .single() part
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: storySingleFailMock,
            })),
          })),
        } as any;
      }
      return {} as any;
    });
    mockGenerateStoryFromWords.mockReset();
    mockGenerateStoryFromWords.mockResolvedValue(mockGeminiBits);

    await expect(generateAndSaveStory(vocabularyId)).rejects.toThrowError(
      expect.objectContaining({
        name: "StoryGenerationError",
        code: "STORY_CREATION_FAILED",
      }),
    );
    expect(storySingleFailMock).toHaveBeenCalled();
    fromSpy.mockRestore();
  });

  test.skip("throws StoryGenerationError if inserting story bits fails and attempts cleanup", async () => {
    const fromSpy = vi.spyOn(mockSupabase, "from");

    const vocabSingleSuccess = vi.fn().mockResolvedValue({
      data: mockVocabulary,
      error: null,
    });
    const wordsEqSuccess = vi.fn().mockResolvedValue({
      data: mockWords,
      error: null,
    });
    const storyInsertSingleSuccess = vi.fn().mockResolvedValue({
      data: { id: mockNewStoryId },
      error: null,
    });
    const storyDeleteEqSuccess = vi.fn().mockResolvedValue({ error: null }); // For cleanup
    const storyBitsInsertFail = vi.fn().mockResolvedValue({
      error: { message: "Bits insert DB error" },
    }); // Actual fail point

    fromSpy.mockImplementationOnce((tableName: string) => {
      if (tableName === "vocabularies") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vocabSingleSuccess })),
          })),
        };
      }
      if (tableName === "vocabulary_words") {
        return { select: vi.fn(() => ({ eq: wordsEqSuccess })) };
      }
      if (tableName === "stories") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: storyInsertSingleSuccess })),
          })),
          delete: vi.fn(() => ({ eq: storyDeleteEqSuccess })),
        };
      }
      if (tableName === "story_bits") {
        return { insert: storyBitsInsertFail };
      }
      return {} as any; // Fallback, should ideally not be hit
    });
    mockGenerateStoryFromWords.mockReset();
    mockGenerateStoryFromWords.mockResolvedValue(mockGeminiBits);

    await expect(generateAndSaveStory(vocabularyId)).rejects.toThrowError(
      expect.objectContaining({
        name: "StoryGenerationError",
        code: "BITS_INSERTION_FAILED",
      }),
    );

    expect(storyInsertSingleSuccess).toHaveBeenCalled();
    expect(storyBitsInsertFail).toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledWith("stories");
    expect(storyDeleteEqSuccess).toHaveBeenCalledWith("id", mockNewStoryId);
    fromSpy.mockRestore();
  });
});
