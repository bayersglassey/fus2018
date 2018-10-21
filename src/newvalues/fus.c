
#include "includes.h"

void fus_init(fus_t *fus){
    fus_core_init(&fus->core);
    fus_symtable_init(&fus->symtable, &fus->core);
    fus_vm_init(&fus->vm, &fus->core, &fus->symtable);
}

void fus_cleanup(fus_t *fus){
    fus_vm_cleanup(&fus->vm);
    fus_symtable_cleanup(&fus->symtable);
    fus_core_cleanup(&fus->core);
}
