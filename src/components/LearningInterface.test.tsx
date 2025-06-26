import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LearningInterface from "./LearningInterface"; // Adjust path as necessary
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext } from "@/contexts/AuthContext"; // Adjust path
import { toast } from "@/hooks/use-toast"; // Adjust path

// Hoisted mock for Supabase client
vi.mock("@/integrations/supabase/client", () => {
  const mockClient = {
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    update: vi.fn(() => Promise.resolve({ data: null, error: null })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { audioUrl: "mocked_audio_url" }, error: null })),
    },
  };
  return { supabase: mockClient };
});

const mockUser = { id: "test-user-id", email: "test@example.com" };

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    // Mock other functions from AuthContextType if your component uses them
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  // AuthProvider: ({ children }) => <>{children}</>, // Optional: if something still needs AuthProvider
}));


// Mock useToast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Import the mocked supabase instance to configure its behavior in tests
import { supabase as mockedSupabase } from "@/integrations/supabase/client";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Disable retries for tests
      staleTime: 0, // Make queries stale immediately for testing
      cacheTime: 0, // Optional: clear cache quickly too, might help with refetches
    },
  },
});


const mockWordsData = [
  { id: "w1", word: "Apple", translation: "Manzana", vocabulary_id: "v1", audio_url: null },
  { id: "w2", word: "Banana", translation: "Plátano", vocabulary_id: "v1", audio_url: null },
  { id: "w3", word: "Cherry", translation: "Cereza", vocabulary_id: "v1", audio_url: null },
  { id: "w4", word: "Date", translation: "Dátil", vocabulary_id: "v1", audio_url: null },
];

const mockProgressData = []; // Start with no progress

const renderComponent = () => {
  // All Supabase mocks (including 'from', 'update', 'insert', etc.)
  // are now expected to be set up in `beforeEach` or within each test specifically
  // *before* `renderComponent` is called.
  // We can still set up general non-data-fetching mocks here if needed.
  (mockedSupabase.update as vi.Mock).mockResolvedValue({ error: null });
  (mockedSupabase.insert as vi.Mock).mockResolvedValue({ error: null });
  (mockedSupabase.upsert as vi.Mock).mockResolvedValue({ error: null });
  (mockedSupabase.functions.invoke as vi.Mock).mockResolvedValue({ data: { audioUrl: "mocked_audio_url" }, error: null });
  // Note: .select() is part of the chain initiated by .from(),
  // so its behavior is dictated by the .from() mock.

  return render(
    <QueryClientProvider client={queryClient}>
      <LearningInterface
        vocabularyId="v1"
        vocabularyTitle="Test Vocab"
        onBack={vi.fn()}
      />
    </QueryClientProvider>
  );
};

describe("LearningInterface", () => {
  beforeEach(() => {
    vi.useRealTimers(); // Ensure we use real timers unless a specific test needs fakes
    vi.clearAllMocks();
    queryClient.clear();

    // Default mock setup for 'from' that can be used by simple tests
    // More complex tests will override this with their own mockImplementation.
    (mockedSupabase.from as vi.Mock).mockImplementation((tableName: string) => {
      if (tableName === "vocabulary_words") {
        const eqMock = vi.fn().mockResolvedValue({ data: mockWordsData, error: null });
        return { select: vi.fn(() => ({ eq: eqMock })) };
      }
      if (tableName === "user_progress") {
        const secondEqMock = vi.fn().mockResolvedValue({ data: mockProgressData, error: null });
        const firstEqMock = vi.fn(() => ({ eq: secondEqMock }));
        return { select: vi.fn(() => ({ eq: firstEqMock })) };
      }
      // Default fallback for any other table
      const defaultEqMock = vi.fn().mockResolvedValue({ data: [], error: null });
      return { select: vi.fn(() => ({ eq: defaultEqMock })) };
    });
  });

  it("renders loading state initially then words", async () => {
    // This test will use the default mocks from beforeEach
    renderComponent();
    expect(await screen.findByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Choose the correct translation")).toBeInTheDocument();
  });

  it("shows choice challenge first for a new word", async () => {
    renderComponent();
    expect(await screen.findByText("Apple")).toBeInTheDocument();
    // Check for choice options (translations)
    expect(await screen.findByText("Manzana")).toBeInTheDocument(); // Correct one
    // Other options would be dynamically generated
    expect(screen.getByText("Choose the correct translation")).toBeInTheDocument();
  });

  it("progresses to typing challenge after correct choice", async () => {
    const progressAfterChoice = [
      { id: "p1", word_id: "w1", user_id: mockUser.id, vocabulary_id: "v1",
        choice_correct: true, typing_correct: false, is_correct: false, attempts: 1 }
    ];

    const secondEqForProgressMock = vi.fn()
      .mockResolvedValueOnce({ data: mockProgressData, error: null }) // Initial load
      .mockResolvedValueOnce({ data: progressAfterChoice, error: null }); // Refetch after correct choice

    (mockedSupabase.from as vi.Mock).mockImplementation((tableName: string) => {
      if (tableName === "vocabulary_words") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: mockWordsData, error: null }) };
      }
      if (tableName === "user_progress") {
        // Simulates: .from("user_progress").select(selector).eq(filter1_col, filter1_val).eq(filter2_col, filter2_val)
        // The first .eq() call (e.g. for user_id) should return an object that has the second .eq() method.
        // That second .eq() method (e.g. for vocabulary_id) is the one that finally resolves with data (via secondEqForProgressMock).
        const firstEqReturnObject = { eq: secondEqForProgressMock };
        const firstEqMock = vi.fn(() => firstEqReturnObject);
        return { select: vi.fn(() => ({ eq: firstEqMock })) };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }; // Default fallback
    });

    renderComponent(); // Initial render uses the first mockResolvedValueOnce for progress

    expect(await screen.findByText("Apple")).toBeInTheDocument();
    const correctChoiceButton = await screen.findByText("Manzana"); // Only one declaration now

    // Mock the database insert operation that updateProgressMutation will trigger
    (mockedSupabase.insert as vi.Mock).mockResolvedValueOnce({ error: null });

    // Action: User clicks the correct choice
    fireEvent.click(correctChoiceButton);

    await waitFor(() => {
        expect(screen.getByText("Correct!")).toBeInTheDocument();
    });

    // Manually set the query data to simulate the state after refetch
    act(() => {
      queryClient.setQueryData(["user-progress", "v1", mockUser.id], progressAfterChoice);
    });

    // Now, the useEffect should run with the new progress and update the challengeType.
    // And then clicking "Next Word" should show the typing challenge for the same word.
    // This part was simplified in the previous step, let's ensure it's complete.
    fireEvent.click(screen.getByText("Next Word"));

    await waitFor(() => {
      // Expect to stay on Apple, but in typing mode
      expect(screen.getByText("Apple")).toBeInTheDocument();
      expect(screen.getByText("Type the translation (half hidden below)")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Type the translation")).toBeInTheDocument();
    });
  });

  it("handles correct typed answer and moves to next word's choice challenge", async () => {
    const progressWhenTypingStarts = [
      { id: "p1", word_id: "w1", user_id: mockUser.id, vocabulary_id: "v1",
        choice_correct: true, typing_correct: false, is_correct: false, attempts: 1 }
    ];
    const progressAfterTypingCorrectly = [
      { ...progressWhenTypingStarts[0], typing_correct: true, is_correct: true, attempts: 2 }
    ];
    const progressForNextWordInitial = mockProgressData.filter(p => p.word_id === 'w2'); // Empty initially

    const secondEqForProgressMock = vi.fn()
      .mockResolvedValueOnce({ data: progressWhenTypingStarts, error: null }) // Initial load for this test
      .mockResolvedValueOnce({ data: progressAfterTypingCorrectly, error: null }) // Refetch after typing 'Manzana'
      .mockResolvedValueOnce({ data: progressForNextWordInitial, error: null }); // Refetch when 'Banana' loads

    (mockedSupabase.from as vi.Mock).mockImplementation((tableName: string) => {
      if (tableName === "vocabulary_words") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: mockWordsData, error: null }) };
      }
      if (tableName === "user_progress") {
        const firstEqReturnObject = { eq: secondEqForProgressMock };
        const firstEqMock = vi.fn(() => firstEqReturnObject);
        return { select: vi.fn(() => ({ eq: firstEqMock })) };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    renderComponent(); // No longer accepts arguments; initial progress handled by secondEqForProgressMock

    expect(await screen.findByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Type the translation (half hidden below)")).toBeInTheDocument();
    const typingInput = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(typingInput, { target: { value: "Manzana" } });

    (mockedSupabase.update as vi.Mock).mockResolvedValueOnce({ error: null });

    fireEvent.click(screen.getByText("Submit Answer"));
    await waitFor(() => expect(screen.getByText("Correct!")).toBeInTheDocument());

    // Manually set the query data for the state after typing Apple correctly
    act(() => {
      queryClient.setQueryData(["user-progress", "v1", mockUser.id], progressAfterTypingCorrectly);
    });

    // Ensure this setQueryData has been processed and reflected, e.g., by checking the updated count
    // The count "1 of 4 words completed" is based on 'is_correct' field in progress.
    await waitFor(() => expect(screen.getByText("1 of 4 words completed")).toBeInTheDocument());

    // Click "Next Word" - this should trigger setCurrentIndex and then useEffect
    fireEvent.click(screen.getByText("Next Word"));

    // After clicking Next, the component should update to Banana
    // The useEffect will use the progressAfterTypingCorrectly (where Banana has no progress)
    // and then determine it's a choice challenge for Banana.
    // The third call to secondEqForProgressMock for Banana's actual progress fetch will occur
    // when/if the component specifically fetches for Banana (which it might not immediately need to
    // if it can determine the state from the existing overall progress data).
    await waitFor(() => {
      expect(screen.getByText("Banana")).toBeInTheDocument();
    });
    expect(screen.getByText("Choose the correct translation")).toBeInTheDocument();
    expect(await screen.findByText("Plátano")).toBeInTheDocument();
  });

  it("handles incorrect typed answer", async () => {
     const progressBeforeTypingAttempt = [
      { id: "p1", word_id: "w1", user_id: mockUser.id, vocabulary_id: "v1",
        choice_correct: true, typing_correct: false, is_correct: false, attempts: 1 }
    ];
    const progressAfterIncorrectTyping = [ // is_correct and typing_correct remain false
      { ...progressBeforeTypingAttempt[0], attempts: 2 }
    ];

    const secondEqForProgressMock = vi.fn()
      .mockResolvedValueOnce({ data: progressBeforeTypingAttempt, error: null }) // Initial
      .mockResolvedValueOnce({ data: progressAfterIncorrectTyping, error: null }); // Refetch

    (mockedSupabase.from as vi.Mock).mockImplementation((tableName: string) => {
      if (tableName === "vocabulary_words") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: mockWordsData, error: null }) };
      }
      if (tableName === "user_progress") {
        const firstEqReturnObject = { eq: secondEqForProgressMock };
        const firstEqMock = vi.fn(() => firstEqReturnObject);
        return { select: vi.fn(() => ({ eq: firstEqMock })) };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
    renderComponent(); // No longer accepts arguments; initial progress handled by secondEqForProgressMock

    expect(await screen.findByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Type the translation (half hidden below)")).toBeInTheDocument();
    const typingInput = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(typingInput, { target: { value: "WrongAnswer" } });

    (mockedSupabase.update as vi.Mock).mockResolvedValueOnce({ error: null });

    fireEvent.click(screen.getByText("Submit Answer"));

    await waitFor(() => expect(screen.getByText("Incorrect")).toBeInTheDocument());
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("updates completed words count only when both challenges are done", async () => {
    const progressAfterChoice = [{
        id: "p1", word_id: "w1", user_id: mockUser.id, vocabulary_id: "v1",
        choice_correct: true, typing_correct: false, is_correct: false, attempts: 1
    }];
    const progressAfterTyping = [{
        ...progressAfterChoice[0], typing_correct: true, is_correct: true, attempts: 2
    }];

    const secondEqForProgressMock = vi.fn()
      .mockResolvedValueOnce({ data: mockProgressData, error: null }) // Initial empty progress
      .mockResolvedValueOnce({ data: progressAfterChoice, error: null }) // After correct choice
      .mockResolvedValueOnce({ data: progressAfterTyping, error: null }); // After correct typing

    (mockedSupabase.from as vi.Mock).mockImplementation((tableName: string) => {
      if (tableName === "vocabulary_words") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: mockWordsData, error: null }) };
      }
      if (tableName === "user_progress") {
        const firstEqReturnObject = { eq: secondEqForProgressMock };
        const firstEqMock = vi.fn(() => firstEqReturnObject);
        return { select: vi.fn(() => ({ eq: firstEqMock })) };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({data: [], error: null})};
    });

    renderComponent();

    expect(await screen.findByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("0 of 4 words completed")).toBeInTheDocument();

    // 1. Correct choice for "Apple"
    (mockedSupabase.insert as vi.Mock).mockResolvedValueOnce({ error: null }); // For the mutation

    fireEvent.click(await screen.findByText("Manzana"));
    await waitFor(() => expect(screen.getByText("Correct!")).toBeInTheDocument());

    // Manually set query data for state after choice
    act(() => {
      queryClient.setQueryData(["user-progress", "v1", mockUser.id], progressAfterChoice);
    });

    await waitFor(() => expect(screen.getByText("0 of 4 words completed")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Next Word"));

    // 2. Correct typing for "Apple"
    await waitFor(() => expect(screen.getByPlaceholderText("Type the translation")).toBeInTheDocument());
    (mockedSupabase.update as vi.Mock).mockResolvedValueOnce({ error: null }); // For the mutation

    fireEvent.change(screen.getByPlaceholderText("Type the translation"), { target: { value: "Manzana" } });
    fireEvent.click(screen.getByText("Submit Answer"));
    await waitFor(() => expect(screen.getByText("Correct!")).toBeInTheDocument());

    // Manually set query data for state after typing
    act(() => {
      queryClient.setQueryData(["user-progress", "v1", mockUser.id], progressAfterTyping);
    });

    // Count should now be 1
    await waitFor(() => expect(screen.getByText("1 of 4 words completed")).toBeInTheDocument());
  });

});

// Helper to generate display word (simplified for predictability in tests if needed)
// Or mock Math.random if more control over `generateDisplayWord` is needed.
// For now, we're testing the flow more than the exact asterisk pattern.
