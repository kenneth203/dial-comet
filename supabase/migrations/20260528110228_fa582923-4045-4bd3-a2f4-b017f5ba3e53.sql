insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', true)
on conflict (id) do update set public = true;

do $$ begin
  create policy "Public read invoice pdfs"
    on storage.objects for select
    using (bucket_id = 'invoice-pdfs');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated upload invoice pdfs"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'invoice-pdfs');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated update invoice pdfs"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'invoice-pdfs');
exception when duplicate_object then null; end $$;