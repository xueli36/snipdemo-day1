import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ShortLink } from './link-api.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
  });

  afterEach(() => http.verify());

  it('rejects invalid URLs before sending a request', () => {
    component.form.controls.url.setValue('ftp://example.com');
    component.createLink();

    expect(component.form.controls.url.invalid).toBeTrue();
    expect(component.form.controls.url.touched).toBeTrue();
    http.expectNone('http://localhost:3000/api/links');
  });

  it('creates a link, prevents duplicate submissions, and refreshes the list', () => {
    const link: ShortLink = {
      code: 'aB123x',
      url: 'https://example.com/page',
      shortUrl: 'http://localhost:3000/aB123x',
      hits: 0,
      createdAt: '2026-11-12T08:00:00.000Z'
    };
    component.form.controls.url.setValue(link.url);
    component.createLink();
    component.createLink();

    const request = http.expectOne('http://localhost:3000/api/links');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ url: link.url });
    request.flush(link);

    http.expectOne('http://localhost:3000/api/links').flush([link]);
    expect(component.createdLink()).toEqual(link);
    expect(component.links()).toEqual([link]);
    expect(component.isSubmitting()).toBeFalse();
  });

  it('shows API errors beside the URL field', () => {
    component.form.controls.url.setValue('https://example.com');
    component.createLink();
    http.expectOne('http://localhost:3000/api/links').flush(
      { error: 'Invalid URL' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.formError()).toBe('Invalid URL');
    expect(component.isSubmitting()).toBeFalse();
  });
});
