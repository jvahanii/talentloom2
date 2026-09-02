ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS cv_path text,
  ADD COLUMN IF NOT EXISTS cover_letter_path text;

CREATE POLICY "org members read candidate files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-files' AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "org members upload candidate files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'candidate-files' AND public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'member'::public.org_role));

CREATE POLICY "org members update candidate files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'candidate-files' AND public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'member'::public.org_role))
WITH CHECK (bucket_id = 'candidate-files' AND public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'member'::public.org_role));

CREATE POLICY "org members delete candidate files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'candidate-files' AND public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'admin'::public.org_role));