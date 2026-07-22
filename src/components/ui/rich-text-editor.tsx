import { useEffect, useRef, useCallback } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const toolbarOptions = [
  [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  [{ 'indent': '-1'}, { 'indent': '+1' }],
  [{ 'color': [] }, { 'background': [] }],
  [{ 'align': [] }],
  ['link', 'image'],
  ['clean']
];

export function RichTextEditor({ value, onChange, placeholder = "Enter text...", className, minHeight = "300px" }: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInternalChange = useRef(false);

  const handleChange = useCallback(() => {
    if (quillRef.current && !isInternalChange.current) {
      const html = quillRef.current.root.innerHTML;
      onChange(html === '<p><br></p>' ? '' : html);
    }
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: toolbarOptions,
      },
    });

    const toolbar = quill.getModule('toolbar') as any;

    // Override image handler to upload file to cloud storage
    toolbar.addHandler('image', () => {
      fileInputRef.current?.click();
    });

    // Manually inject "Insert Button" into toolbar
    const toolbarEl = containerRef.current?.querySelector('.ql-toolbar');
    if (toolbarEl) {
      const btnGroup = document.createElement('span');
      btnGroup.className = 'ql-formats';
      const insertBtn = document.createElement('button');
      insertBtn.type = 'button';
      insertBtn.title = 'Insert Button';
      insertBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`;
      insertBtn.addEventListener('click', () => {
        const label = prompt('Button text:', 'Click Here');
        if (!label) return;
        const url = prompt('Button link URL:', 'https://');
        if (!url) return;

        const quillEditor = quillRef.current;
        if (!quillEditor) return;

        const range = quillEditor.getSelection(true);
        const buttonHtml = `<p><a href="${url}" target="_blank" rel="noopener noreferrer" class="nb-button">${label}</a></p>`;
        quillEditor.clipboard.dangerouslyPasteHTML(range.index, buttonHtml);
        handleChange();
      });
      btnGroup.appendChild(insertBtn);
      // Insert before the last group (clean)
      const cleanGroup = toolbarEl.querySelector('.ql-formats:last-child');
      if (cleanGroup) {
        toolbarEl.insertBefore(btnGroup, cleanGroup);
      } else {
        toolbarEl.appendChild(btnGroup);
      }
    }

    quill.on('text-change', handleChange);
    quillRef.current = quill;

    // Set initial value
    if (value) {
      isInternalChange.current = true;
      quill.root.innerHTML = value;
      isInternalChange.current = false;
    }

    return () => {
      quill.off('text-change', handleChange);
      quillRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (quillRef.current) {
      const currentHtml = quillRef.current.root.innerHTML;
      const normalizedCurrent = currentHtml === '<p><br></p>' ? '' : currentHtml;
      if (value !== normalizedCurrent) {
        isInternalChange.current = true;
        quillRef.current.root.innerHTML = value || '';
        isInternalChange.current = false;
      }
    }
  }, [value]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quillRef.current) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload an image file (PNG, JPG, GIF, WebP, or SVG).');
      return;
    }

    const filePath = `${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('noticeboard-images')
      .upload(filePath, file);

    if (error) {
      alert('Failed to upload image. Please try again.');
      console.error('Upload error:', error);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('noticeboard-images')
      .getPublicUrl(data.path);

    const range = quillRef.current.getSelection(true);
    quillRef.current.insertEmbed(range.index, 'image', urlData.publicUrl);

    // Style the inserted image as a small icon
    const images = quillRef.current.root.querySelectorAll('img');
    const lastImg = images[images.length - 1];
    if (lastImg) {
      lastImg.setAttribute('width', '24');
      lastImg.setAttribute('height', '24');
      lastImg.style.width = '24px';
      lastImg.style.height = '24px';
      lastImg.style.display = 'inline-block';
      lastImg.style.verticalAlign = 'middle';
    }
    quillRef.current.setSelection(range.index + 1);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <div ref={containerRef} className={cn("rich-text-editor", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleImageUpload}
      />
      <style dangerouslySetInnerHTML={{
        __html: `
          .rich-text-editor .ql-editor {
            min-height: ${minHeight};
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 14px;
            line-height: 1.5;
          }
          
          .rich-text-editor .ql-toolbar {
            border: 1px solid hsl(var(--border));
            border-bottom: none;
            border-radius: 8px 8px 0 0;
            background: hsl(var(--background));
            position: sticky;
            top: 0;
            z-index: 10;
          }
          
          .rich-text-editor .ql-container {
            border: 1px solid hsl(var(--border));
            border-radius: 0 0 8px 8px;
            background: hsl(var(--background));
          }
          
          .rich-text-editor .ql-editor.ql-blank::before {
            color: hsl(var(--muted-foreground));
            font-style: normal;
          }
          
          .rich-text-editor .ql-toolbar .ql-picker-label {
            color: hsl(var(--foreground));
          }
          
          .rich-text-editor .ql-toolbar button {
            color: hsl(var(--foreground));
          }
          
          .rich-text-editor .ql-toolbar button:hover {
            background: hsl(var(--accent));
          }
          
          .rich-text-editor .ql-toolbar button.ql-active {
            background: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
          }

          .rich-text-editor .ql-toolbar .ql-insertButton {
            width: auto;
            padding: 0 6px;
          }
          
          .rich-text-editor .ql-editor img {
            width: 24px;
            height: 24px;
            display: inline-block;
            vertical-align: middle;
            object-fit: contain;
          }

          /* Branded button styling inside editor */
          .rich-text-editor .ql-editor .nb-button,
          .rich-text-content .nb-button {
            display: inline-block;
            padding: 10px 24px;
            background: linear-gradient(135deg, hsl(355 70% 45%), hsl(210 64% 30%));
            color: #fff !important;
            font-weight: 600;
            font-size: 14px;
            border-radius: 8px;
            text-decoration: none !important;
            box-shadow: 0 4px 14px -4px hsl(355 70% 45% / 0.4);
            transition: all 0.2s ease;
            cursor: pointer;
          }

          .rich-text-content .nb-button:hover {
            box-shadow: 0 0 24px hsl(355 70% 55% / 0.5);
            opacity: 0.95;
          }
        `
      }} />
      
      <div ref={editorRef} />
    </div>
  );
}

RichTextEditor.displayName = "RichTextEditor";
