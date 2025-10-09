import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

@Pipe({
  name: 'markdown'
})
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    // marked.parse may return a Promise<string> in some configurations (async rendering)
    const result = marked.parse(value);
    if (typeof result === 'string') {
      return result;
    }
    // If result is a Promise, this is not supported in Angular pipes (must be sync)
    // Fallback: throw or return empty string
    console.error('marked.parse returned a Promise, which is not supported in Angular pipes.');
    return '';
  }
}
