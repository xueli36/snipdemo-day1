import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { LinkApiService, ShortLink } from './link-api.service';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  readonly currentYear = new Date().getFullYear();
  readonly form = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, httpUrlValidator]
    })
  });
  readonly links = signal<ShortLink[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly loadError = signal('');
  readonly formError = signal('');
  readonly createdLink = signal<ShortLink | null>(null);

  constructor(private readonly linkApi: LinkApiService) {}

  ngOnInit(): void {
    this.refreshLinks();
  }

  createLink(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.formError.set('');
    this.createdLink.set(null);
    this.isSubmitting.set(true);

    this.linkApi.createLink(this.form.controls.url.value.trim()).pipe(
      finalize(() => this.isSubmitting.set(false))
    ).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.refreshLinks();
      },
      error: (error: unknown) => this.formError.set(this.getErrorMessage(error))
    });
  }

  refreshLinks(): void {
    this.isLoading.set(true);
    this.loadError.set('');

    this.linkApi.getLinks().pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (links) => this.links.set(links),
      error: (error: unknown) => this.loadError.set(this.getErrorMessage(error))
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const message = body.error;
        if (typeof message === 'string') return message;
      }
    }
    return 'Could not reach the Snip API. Please try again.';
  }
}

const httpUrlValidator: ValidatorFn = (control) => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
}
