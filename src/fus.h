#ifndef _FUS_H_
#define _FUS_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

struct fus {
    fus_core_t core;
    fus_lexer_t lexer;
    fus_parser_t parser;
    fus_symtable_t symtable;
    fus_vm_t vm;
    fus_runner_t runner;
    fus_printer_t printer;
};

void fus_init(fus_t *fus);
void fus_cleanup(fus_t *fus);

int fus_run_text(fus_t *fus, const char *text, const char *def_name);

#endif