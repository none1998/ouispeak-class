using System.Text.Json;
using Lingono.Api.Models;

namespace Lingono.Api.Services;

/// <summary>
/// Converts between the database and the exact JSON shape your old JavaScript
/// used (dataset / vocabDataset), so the student pages barely need to change:
///   { "A2 - სასაუბრო კურსი": { "kvira_1": { "1": { instruction, questions: [...] } } } }
/// </summary>
public static class ContentShape
{
    // ---------- database → website ----------

    public static Dictionary<string, object> Exercises(Course course) => new()
    {
        [course.Name] = course.Weeks
            .Where(w => w.Blocks.Count > 0)
            .OrderBy(w => w.Number)
            .ToDictionary(
                w => $"kvira_{w.Number}",
                w => (object)w.Blocks.OrderBy(b => b.Order).ToDictionary(b => b.Order.ToString(), b => (object)Block(b)))
    };

    public static Dictionary<string, object> Vocab(Course course) => new()
    {
        [course.Name] = course.Weeks
            .Where(w => w.VocabSections.Count > 0)
            .OrderBy(w => w.Number)
            .ToDictionary(
                w => $"kvira_{w.Number}",
                w => (object)w.VocabSections.OrderBy(s => s.Order).ToDictionary(s => s.Order.ToString(), s => (object)new
                {
                    instruction = s.Instruction,
                    vocabulary = s.Words.OrderBy(x => x.Order).Select(x => new { french = x.French, georgian = x.Georgian })
                }))
    };

    private static Dictionary<string, object> Block(ExerciseBlock b)
    {
        var json = new Dictionary<string, object> { ["instruction"] = b.Instruction };
        if (b.Type != null) json["type"] = b.Type;
        if (b.TextFile != null) json["textFile"] = b.TextFile;
        if (b.Video != null) json["video"] = b.Video;
        if (b.Audio != null) json["audio"] = b.Audio;
        if (b.Questions.Count > 0)
            json["questions"] = b.Questions.OrderBy(q => q.Order).Select(Question).ToList();
        return json;
    }

    private static Dictionary<string, object> Question(Question q)
    {
        var json = new Dictionary<string, object> { ["text"] = q.Text };
        if (q.Options != null) json["options"] = q.Options;
        json["answer"] = q.Answer;
        if (q.Type != null) json["type"] = q.Type;
        if (q.Audio != null) json["audio"] = q.Audio;
        if (q.Image != null) json["image"] = q.Image;
        return json;
    }

    // ---------- old JS data → database (one-time import) ----------

    public static List<Course> Import(JsonElement exercises, JsonElement vocab)
    {
        var courses = new Dictionary<string, Course>();
        Week GetWeek(string courseName, string weekKey)
        {
            if (!courses.TryGetValue(courseName, out var course))
                courses[courseName] = course = new Course { Name = courseName };
            var number = int.Parse(new string(weekKey.Where(char.IsDigit).ToArray()));
            var week = course.Weeks.FirstOrDefault(w => w.Number == number);
            if (week == null) course.Weeks.Add(week = new Week { Number = number });
            return week;
        }

        if (exercises.ValueKind == JsonValueKind.Object)
            foreach (var c in exercises.EnumerateObject())
            foreach (var w in c.Value.EnumerateObject())
            {
                var week = GetWeek(c.Name, w.Name);
                foreach (var b in w.Value.EnumerateObject())
                {
                    var block = new ExerciseBlock
                    {
                        Order = int.Parse(b.Name),
                        Instruction = Str(b.Value, "instruction") ?? "",
                        Type = Str(b.Value, "type"),
                        TextFile = Str(b.Value, "textFile"),
                        Video = Str(b.Value, "video"),
                        Audio = Str(b.Value, "audio"),
                    };
                    if (b.Value.TryGetProperty("questions", out var qs) && qs.ValueKind == JsonValueKind.Array)
                    {
                        var i = 1;
                        foreach (var q in qs.EnumerateArray())
                            block.Questions.Add(new Question
                            {
                                Order = i++,
                                Text = Str(q, "text") ?? "",
                                Answer = Str(q, "answer") ?? "",
                                Type = Str(q, "type"),
                                Options = q.TryGetProperty("options", out var o) && o.ValueKind == JsonValueKind.Array
                                    ? o.EnumerateArray().Select(x => x.ToString()).ToList()
                                    : null
                            });
                    }
                    week.Blocks.Add(block);
                }
            }

        if (vocab.ValueKind == JsonValueKind.Object)
            foreach (var c in vocab.EnumerateObject())
            foreach (var w in c.Value.EnumerateObject())
            {
                var week = GetWeek(c.Name, w.Name);
                foreach (var s in w.Value.EnumerateObject())
                {
                    var section = new VocabSection { Order = int.Parse(s.Name), Instruction = Str(s.Value, "instruction") ?? "" };
                    if (s.Value.TryGetProperty("vocabulary", out var words) && words.ValueKind == JsonValueKind.Array)
                    {
                        var i = 1;
                        foreach (var x in words.EnumerateArray())
                            section.Words.Add(new VocabWord { Order = i++, French = Str(x, "french") ?? "", Georgian = Str(x, "georgian") ?? "" });
                    }
                    week.VocabSections.Add(section);
                }
            }

        return courses.Values.ToList();
    }

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : null;
}
