#ifndef _FUS_STR_H_
#define _FUS_STR_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


#define FUS_STR_ESCAPABLE_CHARS "\"\\"


struct fus_str {
    char *text;
    int len;
    size_t size;
        /* If text != NULL && size == 0, then str doesn't own its text
        (e.g. text was a C string literal) */
};


void fus_str_init(fus_vm_t *vm, fus_str_t *s,
    char *text, int len, size_t size);
void fus_str_cleanup(fus_vm_t *vm, fus_str_t *s);

int fus_str_len(fus_vm_t *vm, fus_str_t *s);
bool fus_str_eq(fus_vm_t *vm, fus_str_t *s1, fus_str_t *s2);
void fus_str_join(fus_vm_t *vm, fus_str_t *s1, fus_str_t *s2);
void fus_str_slice(fus_vm_t *vm, fus_str_t *s, int i0, int len);

void fus_boxed_str_mkunique(fus_boxed_t **p_ptr);

fus_value_t fus_value_str(fus_vm_t *vm,
    char *text, int len, size_t size);
fus_value_t fus_value_str_len(fus_vm_t *vm, fus_value_t value);
fus_value_t fus_value_str_eq(fus_vm_t *vm, fus_value_t value1,
    fus_value_t value2);
const char *fus_value_str_decode(fus_value_t value);
void fus_value_str_join(fus_vm_t *vm, fus_value_t *value_s1_ptr,
    fus_value_t value_s2);
void fus_value_str_slice(fus_vm_t *vm, fus_value_t *value_s_ptr,
    fus_value_t value_i, fus_value_t value_len);


#endif