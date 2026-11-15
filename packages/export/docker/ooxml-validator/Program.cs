using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using System.Text.Json;

var results = new List<object>();
foreach (var file in args)
{
    try
    {
        using var doc = PresentationDocument.Open(file, false);
        var validator = new OpenXmlValidator(FileFormatVersions.Microsoft365);
        var errors = validator.Validate(doc).Take(200).Select(e => new {
            id = e.Id, description = e.Description, part = e.Part?.Uri.ToString(), path = e.Path?.XPath, type = e.ErrorType.ToString()
        }).ToList();
        results.Add(new { file, ok = errors.Count == 0, errors });
    }
    catch (Exception ex)
    {
        results.Add(new { file, ok = false, errors = new[] { new { id = "open", description = ex.Message, part = (string?)null, path = (string?)null, type = "Package" } } });
    }
}
Console.WriteLine(JsonSerializer.Serialize(results));
