

#include "includes.h"


static void print_sig(fus_vm_t *vm, fus_arr_t *sig, FILE *file){
    fus_printer_t printer;
    fus_printer_init(&printer);
    fus_printer_set_file(&printer, file);
    fus_printer_set_style_inline(&printer);
    fus_printer_print_data(&printer, vm, sig, 0, -1);
    fus_printer_cleanup(&printer);
}

static int fus_fun_parse_sig(fus_vm_t *vm, fus_fun_t *f, fus_arr_t *sig){
    /* Parse the sig, e.g. (a -> b c) results in
    f->sig_in=1, f->sig_out=2.
    Right now the non "->" elements of the sig can be any syms;
    some day it might make sense to give them extra meaning,
    e.g. (x -> x y) indicates that x will be modified?..
    or we could do type checking, e.g. (a (b -> c) -> d)
    or ((int a) (int b) -> (int c))
    ...etc */

    int sym_i_arrow = fus_symtable_get_or_add_from_string(
        vm->symtable, "->");

    fus_value_t *values = FUS_ARR_VALUES(*sig);
    int values_len = sig->values.len;
    int arrow_index = -1;
    for(int i = 0; i < values_len; i++){
        fus_value_t value = values[i];
        int sym_i = fus_value_sym_decode(vm, value);
        if(sym_i != sym_i_arrow)continue;
        if(arrow_index >= 0){
            fprintf(stderr, "%s: sig has multiple \"->\": ", __func__);
            print_sig(vm, sig, stderr);
            fprintf(stderr, "\n");
            return -1;
        }
        arrow_index = i;
    }

    if(arrow_index < 0){
        fprintf(stderr, "%s: sig is missing \"->\": ", __func__);
        print_sig(vm, sig, stderr);
        fprintf(stderr, "\n");
        return -1;
    }

    f->has_sig = true;
    f->sig_in = arrow_index;
    f->sig_out = values_len - arrow_index - 1;
    return 0;
}

void fus_fun_init(fus_vm_t *vm, fus_fun_t *f, char *name,
    fus_arr_t *data, fus_arr_t *sig
){
    f->name = name;
    fus_arr_copy(vm, &f->data, data);
    if(sig == NULL)fus_arr_init(vm, &f->sig);
    else fus_arr_copy(vm, &f->sig, sig);

    f->has_sig = false;
    f->sig_in = 0;
    f->sig_out = 0;

    if(sig != NULL){
        /* Update sig_in, sig_out */
        fus_fun_parse_sig(vm, f, sig);
    }
}

void fus_fun_cleanup(fus_vm_t *vm, fus_fun_t *f){
    free(f->name);
    fus_arr_cleanup(vm, &f->data);
    fus_arr_cleanup(vm, &f->sig);
}



fus_value_t fus_value_fun(fus_vm_t *vm, char *name,
    fus_arr_t *data, fus_arr_t *sig
){
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_FUN);
    fus_fun_init(vm, &p->data.f, name, data, sig);
    return (fus_value_t)p;
}
