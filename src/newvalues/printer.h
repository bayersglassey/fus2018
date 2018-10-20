#ifndef _FUS_PRINTER_H_
#define _FUS_PRINTER_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


struct fus_printer {
    FILE *file;
    int depth;
    const char *tab;
    const char *newline;
};

void fus_printer_init(fus_printer_t *printer, FILE *file);
void fus_printer_cleanup(fus_printer_t *printer);

void fus_printer_print_tabs(fus_printer_t *printer);
void fus_printer_print_newline(fus_printer_t *printer);


void fus_printer_print_value(fus_printer_t *printer,
    fus_vm_t *vm, fus_value_t value);
void fus_printer_print_boxed(fus_printer_t *printer, fus_boxed_t *p);
void fus_printer_print_data(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a);

#endif