

#include "includes.h"


void fus_fun_init(fus_vm_t *vm, fus_fun_t *f, char *name){
    f->name = name;
    fus_arr_init(vm, &f->data);
}

void fus_fun_init_from_arr(fus_vm_t *vm, fus_fun_t *f, char *name,
    fus_arr_t *data
){
    f->name = name;
    fus_arr_copy(vm, &f->data, data);
}

void fus_fun_cleanup(fus_vm_t *vm, fus_fun_t *f){
    free(f->name);
    fus_arr_cleanup(vm, &f->data);
}



fus_value_t fus_value_fun(fus_vm_t *vm, char *name, fus_arr_t *data){
    /* Creates a new fun value with the given data. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_FUN);
    fus_fun_init_from_arr(vm, &p->data.f, name, data);
    return (fus_value_t)p;
}
