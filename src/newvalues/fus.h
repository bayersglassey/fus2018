#ifndef _FUS_H_
#define _FUS_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

typedef struct fus {
    fus_core_t core;
    fus_lexer_t lexer;
    fus_symtable_t symtable;
    fus_vm_t vm;
    fus_printer_t printer;
} fus_t;

void fus_init(fus_t *fus);
void fus_cleanup(fus_t *fus);

#endif