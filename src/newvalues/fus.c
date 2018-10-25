
#include "includes.h"

void fus_init(fus_t *fus){
    fus_core_init(&fus->core);
    fus_lexer_init(&fus->lexer, NULL);
    fus_symtable_init(&fus->symtable, &fus->core);
    fus_vm_init(&fus->vm, &fus->core, &fus->symtable);
    fus_printer_init(&fus->printer, stdout);
}

void fus_cleanup(fus_t *fus){
    fus_printer_cleanup(&fus->printer);
    fus_vm_cleanup(&fus->vm);
    fus_symtable_cleanup(&fus->symtable);
    fus_lexer_cleanup(&fus->lexer);
    fus_core_cleanup(&fus->core);
}
