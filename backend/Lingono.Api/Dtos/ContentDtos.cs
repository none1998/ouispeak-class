namespace Lingono.Api.Dtos;

// What the admin page sends and receives.
public record QuestionDto(string? Type, string Text, List<string>? Options, string? Answer);
public record BlockDto(string Instruction, string? Type, string? TextFile, string? Video, string? Audio, List<QuestionDto>? Questions);
public record WordDto(string French, string Georgian);
public record SectionDto(string Instruction, List<WordDto> Words);
public record NewCourseDto(string Name);
public record CourseSettingsDto(string Name, string? Level, string? Tag, string? Description, string? SyllabusUrl,
                                bool IsLocked, bool IsVisible, int SortOrder);
public record NewWeekDto(int Number);
public record RecordingDto(int Group, int Week, int Lesson, string Url);
public record RecordingLinkDto(int Week, int Lesson, string Url);
