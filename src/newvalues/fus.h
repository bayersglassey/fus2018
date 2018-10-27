#ifndef _FUS_H_
#define _FUS_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

struct fus {
    fus_core_t core;
    fus_lexer_t lexer;
    fus_symtable_t symtable;
    fus_vm_t vm;
    fus_state_t state;
    fus_printer_t printer;
};

void fus_init(fus_t *fus);
void fus_cleanup(fus_t *fus);

#endif