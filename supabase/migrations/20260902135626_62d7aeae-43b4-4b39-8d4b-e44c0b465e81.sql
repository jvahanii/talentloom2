
CREATE TABLE public.candidate_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cv','cover_letter')),
  label text NOT NULL,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_documents TO authenticated;
GRANT ALL ON public.candidate_documents TO service_role;
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own documents" ON public.candidate_documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_candidate_documents_upd BEFORE UPDATE ON public.candidate_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.candidates ADD COLUMN applicant_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX candidates_applicant_user_id_idx ON public.candidates (applicant_user_id) WHERE applicant_user_id IS NOT NULL;
CREATE POLICY "applicants read own applications" ON public.candidates
  FOR SELECT TO authenticated
  USING (applicant_user_id = auth.uid());

-- Candidates manage files under their own applicants/<uid>/ prefix in candidate-files
CREATE POLICY "applicants upload own files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'candidate-files' AND (storage.foldername(name))[1] = 'applicants' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "applicants read own files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'candidate-files' AND (storage.foldername(name))[1] = 'applicants' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "applicants delete own files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'candidate-files' AND (storage.foldername(name))[1] = 'applicants' AND (storage.foldername(name))[2] = auth.uid()::text);
