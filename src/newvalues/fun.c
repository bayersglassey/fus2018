

#include "includes.h"


void fus_fun_init(fus_vm_t *vm, fus_fun_t *f){
    fus_arr_init(vm, &f->data);
}

void fus_fun_init_from_arr(fus_vm_t *vm, fus_fun_t *f, fus_arr_t *data){
    fus_arr_copy(vm, &f->data, data);
}

void fus_fun_cleanup(fus_vm_t *vm, fus_fun_t *f){
    fus_arr_cleanup(vm, &f->data);
}

