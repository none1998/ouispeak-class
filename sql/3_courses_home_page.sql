-- Course cards of the home page, now managed from admin.html (section "Courses").
-- Run ONCE in Supabase → SQL Editor, BEFORE uploading the new files.
alter table content."Courses"
    add column if not exists "Level"       text    not null default '',
    add column if not exists "Tag"         text    not null default '',
    add column if not exists "Description" text    not null default '',
    add column if not exists "SyllabusUrl" text,
    add column if not exists "IsLocked"    boolean not null default false,
    add column if not exists "IsVisible"   boolean not null default true,
    add column if not exists "SortOrder"   integer not null default 0;

-- Copy what the home page shows today
update content."Courses" set "Level" = 'A1', "Tag" = 'სასაუბრო', "SortOrder" = 1, "IsLocked" = false,
    "Description" = 'კურსის განმავლობაში თქვენ ძალიან სწრაფად ისწავლით ფრანგულად კითხვას...',
    "SyllabusUrl" = 'pdfs/speak_a1_syllabus.pdf'
where "Name" = 'A1 - სასაუბრო კურსი';

update content."Courses" set "Level" = 'A2', "Tag" = 'სასაუბრო', "SortOrder" = 2, "IsLocked" = false,
    "Description" = 'სასაუბრო პრაქტიკა და ენობრივი უნარების გაუმჯობესება A2 დონეზე...',
    "SyllabusUrl" = 'pdfs/speak_a2_syllabus.pdf'
where "Name" = 'A2 - სასაუბრო კურსი';

update content."Courses" set "Level" = 'B1', "Tag" = 'სასაუბრო', "SortOrder" = 3, "IsLocked" = true,
    "Description" = 'სასაუბრო პრაქტიკა და ენობრივი უნარების გაუმჯობესება B1 დონეზე...',
    "SyllabusUrl" = 'pdfs/speak_b1_syllabus.pdf'
where "Name" = 'B1 - სასაუბრო კურსი';

update content."Courses" set "Level" = 'A2', "Tag" = 'DELF', "SortOrder" = 4, "IsLocked" = false,
    "Description" = 'ინტენსიური 26-კვირიანი მოსამზადებელი კურსი, DELF-ის გამოცდისთვის A2 დონეზე...',
    "SyllabusUrl" = 'pdfs/delf_a2_syllabus.pdf'
where "Name" = 'DELF A2 - კურსი';

update content."Courses" set "Level" = 'B1', "Tag" = 'DELF', "SortOrder" = 5, "IsLocked" = false,
    "Description" = 'ინტენსიური 26-კვირიანი მოსამზადებელი კურსი, DELF-ის გამოცდისთვის B1 დონეზე...',
    "SyllabusUrl" = 'pdfs/delf_b1_syllabus.pdf'
where "Name" = 'DELF B1 - კურსი';

-- Check: you should see your 5 courses with their level, tag and order
select "Name", "Level", "Tag", "SortOrder", "IsLocked" from content."Courses" order by "SortOrder";
