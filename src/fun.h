#ifndef _FUS_FUN_H_
#define _FUS_FUN_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


struct fus_fun {
    char *name;
    fus_arr_t data;
    fus_arr_t sig;
    bool has_sig;
    int sig_in;
    int sig_out;
};


void fus_fun_init(fus_vm_t *vm, fus_fun_t *f, char *name,
    fus_arr_t *data, fus_arr_t *sig);
void fus_fun_cleanup(fus_vm_t *vm, fus_fun_t *f);

fus_value_t fus_value_fun(fus_vm_t *vm, char *name,
    fus_arr_t *data, fus_arr_t *sig);

#endif