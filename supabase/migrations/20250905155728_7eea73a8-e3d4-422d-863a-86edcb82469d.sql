
-- 1) Ensure the bucket exists (private)
insert into storage.buckets (id, name, public)
values ('user-documents', 'user-documents', false)
on conflict (id) do nothing;

-- 2) Clean up conflicting/legacy policies (safe to drop if present)
drop policy if exists "Users can view their own documents" on storage.objects;
drop policy if exists "Authenticated users can view their own documents" on storage.objects;

-- 3) Admin/HR full access to user-documents bucket
drop policy if exists "Admins can upload documents for any user" on storage.objects;
create policy "Admins can upload documents for any user"
on storage.objects
for insert
with check (
  bucket_id = 'user-documents'
  and exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('Super-Admin','Admin','HR')
  )
);

drop policy if exists "Admins can view all user documents" on storage.objects;
create policy "Admins can view all user documents"
on storage.objects
for select
using (
  bucket_id = 'user-documents'
  and exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('Super-Admin','Admin','HR')
  )
);

drop policy if exists "Admins can update user documents" on storage.objects;
create policy "Admins can update user documents"
on storage.objects
for update
using (
  bucket_id = 'user-documents'
  and exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('Super-Admin','Admin','HR')
  )
);

drop policy if exists "Admins can delete user documents" on storage.objects;
create policy "Admins can delete user documents"
on storage.objects
for delete
using (
  bucket_id = 'user-documents'
  and exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('Super-Admin','Admin','HR')
  )
);

-- 4) Recipients (and uploader) can SELECT objects that are shared with them
--    This aligns Storage access with document_shares and system_users mapping.
create policy "Recipients can view shared documents (via document_shares)"
on storage.objects
for select
using (
  bucket_id = 'user-documents'
  and exists (
    select 1
    from public.document_shares ds
    left join public.system_users su on su.id = ds.user_id
    where ds.document_path = storage.objects.name
      and (
        -- direct share to auth user_id
        ds.user_id = auth.uid()
        -- or share to the user's system_user_id
        or su.user_id = auth.uid()
        -- or the person who shared it (uploader/admin) can access
        or ds.shared_by = auth.uid()
      )
  )
);
