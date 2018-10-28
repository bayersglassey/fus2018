#ifndef _FUS_PRINTER_H_
#define _FUS_PRINTER_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

#define FUS_PRINTER_BUFSIZE 4096

typedef void fus_printer_flush_t(fus_printer_t *printer);

struct fus_printer {
    fus_printer_flush_t *flush; /* callback */
    void *data; /* data for callback, e.g. FILE* */

    char buffer[FUS_PRINTER_BUFSIZE];
    int buffer_len;
    int buffer_maxlen;

    int depth;
    const char *tab;
    const char *newline;
};

void fus_printer_init(fus_printer_t *printer);
void fus_printer_cleanup(fus_printer_t *printer);

void fus_printer_set_flush(fus_printer_t *printer,
    fus_printer_flush_t *flush, void *data);
void fus_printer_set_file(fus_printer_t *printer, FILE *file);
void fus_printer_flush_file(fus_printer_t *printer);
void fus_printer_flush(fus_printer_t *printer);

void fus_printer_write(fus_printer_t *printer, const char *text,
    int text_len);
void fus_printer_write_char(fus_printer_t *printer, char c);
void fus_printer_write_text(fus_printer_t *printer, const char *text);
void fus_printer_write_long_int(fus_printer_t *printer, long int i);
void fus_printer_write_tabs(fus_printer_t *printer);
void fus_printer_write_newline(fus_printer_t *printer);


void fus_printer_write_value(fus_printer_t *printer,
    fus_vm_t *vm, fus_value_t value);
void fus_printer_write_boxed(fus_printer_t *printer, fus_boxed_t *p);
void fus_printer_write_arr(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a);
void fus_printer_write_data(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a);


void fus_printer_print_value(fus_printer_t *printer,
    fus_vm_t *vm, fus_value_t value);
void fus_printer_print_arr(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a);
void fus_printer_print_data(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a);

#endif