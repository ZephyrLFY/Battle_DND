#ifndef INFOMODEL_H
#define INFOMODEL_H

#include <QAbstractTableModel>
#include <QStringList>
#include <QVector>
#include <QMap>

class infoModel : public QAbstractTableModel
{
    Q_OBJECT
public:
    explicit infoModel(QObject *parent = nullptr);
    virtual ~infoModel();
    void setCell(const QVector<QVector<QString> > &cells);
protected:
    QVariant data(const QModelIndex &index, int role) const;
    int rowCount(const QModelIndex &parent) const;
    int columnCount(const QModelIndex &parent) const;
    QVariant headerData(int section, Qt::Orientation orientation, int role) const;
    signals:
public slots:
private:
    QVector<QVector<QString>> _cells;
    qint16 rowOfTab;
    qint16 colOfTab;
};

#endif // INFOMODEL_H
