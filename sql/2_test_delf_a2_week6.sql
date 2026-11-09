-- Test content: adds a MATCHING and a SPEAKING exercise to week 6 of "DELF A2 - კურსი".
-- Safe to run once. Running it again adds the two exercises a second time.
do $$
declare
    v_course int;
    v_week   int;
    v_order  int;
    v_block  int;
begin
    select "Id" into v_course from content."Courses" where "Name" = 'DELF A2 - კურსი';
    if v_course is null then
        raise exception 'Course "DELF A2 - კურსი" was not found';
    end if;

    select "Id" into v_week from content."Weeks" where "CourseId" = v_course and "Number" = 6;
    if v_week is null then
        insert into content."Weeks" ("CourseId", "Number") values (v_course, 6) returning "Id" into v_week;
    end if;

    select coalesce(max("Order"), 0) into v_order from content."ExerciseBlocks" where "WeekId" = v_week;

    -- 1) Matching: French word <-> Georgian meaning (office vocabulary from week 5)
    insert into content."ExerciseBlocks" ("WeekId", "Order", "Instruction", "Type")
    values (v_week, v_order + 1, 'Associez chaque mot français à sa traduction géorgienne.', 'match')
    returning "Id" into v_block;

    insert into content."Questions" ("BlockId", "Order", "Type", "Text", "Options", "Answer") values
        (v_block, 1, null, 'L''armoire',         null, 'კარადა'),
        (v_block, 2, null, 'Le mot de passe',    null, 'პაროლი'),
        (v_block, 3, null, 'L''imprimante',      null, 'პრინტერი'),
        (v_block, 4, null, 'Le couloir',         null, 'დერეფანი'),
        (v_block, 5, null, 'La photocopieuse',   null, 'ქსეროქსი'),
        (v_block, 6, null, 'La feuille',         null, 'ფურცელი'),
        (v_block, 7, null, 'Le bouton',          null, 'ღილაკი'),
        (v_block, 8, null, 'Mode d''emploi',     null, 'ინსტრუქცია');

    -- 2) Speaking: students record their answers
    insert into content."ExerciseBlocks" ("WeekId", "Order", "Instruction", "Type")
    values (v_week, v_order + 2, 'ჩაიწერეთ ხმა და უპასუხეთ კითხვებს ფრანგულად (თითოეულზე 30 წამიდან 1 წუთამდე).', 'speaking')
    returning "Id" into v_block;

    insert into content."Questions" ("BlockId", "Order", "Type", "Text", "Options", "Answer") values
        (v_block, 1, null, 'Présentez-vous : votre nom, votre âge, votre profession et votre ville.', null, ''),
        (v_block, 2, null, 'Décrivez votre bureau ou votre lieu de travail.', null, ''),
        (v_block, 3, null, 'Qu''est-ce que vous avez fait le week-end dernier ?', null, '');
end $$;
