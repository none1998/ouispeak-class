namespace Lingono.Api.Models;

// Course  →  Week (კვირა)  →  Exercise blocks  →  Questions
//                         →  Vocab sections   →  Words

public class Course
{
    public int Id { get; set; }
    public string Name { get; set; } = "";          // must match Students.course exactly, e.g. "A2 - სასაუბრო კურსი"

    // How the course card looks on the home page
    public string Level { get; set; } = "";         // big letters on the card, e.g. "A2"
    public string Tag { get; set; } = "";           // small word next to it, e.g. "სასაუბრო" or "DELF"
    public string Description { get; set; } = "";
    public string? SyllabusUrl { get; set; }         // e.g. "pdfs/delf_a2_syllabus.pdf" or a full https:// link
    public bool IsLocked { get; set; }               // shown with a lock, students can't register for it
    public bool IsVisible { get; set; } = true;      // false = hidden from the home page (content is kept)
    public int SortOrder { get; set; }               // position on the home page
    public List<Week> Weeks { get; set; } = new();
    public List<Recording> Recordings { get; set; } = new();
}

public class Week
{
    public int Id { get; set; }
    public int CourseId { get; set; }
    public Course? Course { get; set; }
    public int Number { get; set; }                  // 1 → "kvira_1" on the website
    public List<ExerciseBlock> Blocks { get; set; } = new();
    public List<VocabSection> VocabSections { get; set; } = new();
}

public class ExerciseBlock
{
    public int Id { get; set; }
    public int WeekId { get; set; }
    public Week? Week { get; set; }
    public int Order { get; set; }                   // 1, 2, 3 ... (block number in the sidebar)
    public string Instruction { get; set; } = "";
    public string? Type { get; set; }                // null = normal questions, "essay" = free writing
    public string? TextFile { get; set; }            // e.g. "texts/a2_sasaubro_text_1.txt"
    public string? Video { get; set; }               // e.g. "videos/a2_video1.mp4"
    public string? Audio { get; set; }
    public List<Question> Questions { get; set; } = new();
}

public class Question
{
    public int Id { get; set; }
    public int BlockId { get; set; }
    public ExerciseBlock? Block { get; set; }
    public int Order { get; set; }
    public string? Type { get; set; }                // "mc" = multiple choice, "open" = not auto-checked, null = short answer
    public string Text { get; set; } = "";
    public List<string>? Options { get; set; }       // only for "mc"
    public string Answer { get; set; } = "";
}

public class VocabSection
{
    public int Id { get; set; }
    public int WeekId { get; set; }
    public Week? Week { get; set; }
    public int Order { get; set; }
    public string Instruction { get; set; } = "";
    public List<VocabWord> Words { get; set; } = new();
}

public class VocabWord
{
    public int Id { get; set; }
    public int SectionId { get; set; }
    public VocabSection? Section { get; set; }
    public int Order { get; set; }
    public string French { get; set; } = "";
    public string Georgian { get; set; } = "";
}

// A video link of one lesson, for ONE group of a course.
// Students only see the recordings of their own group (Students.group_number).
public class Recording
{
    public int Id { get; set; }
    public int CourseId { get; set; }
    public Course? Course { get; set; }
    public int GroupNumber { get; set; }             // 1, 2, 3 ...
    public int WeekNumber { get; set; }              // 1 → "კვირა 1"
    public int LessonNumber { get; set; }            // 1 or 2 ("გაკვეთილი 1" / "გაკვეთილი 2")
    public string Url { get; set; } = "";
}
